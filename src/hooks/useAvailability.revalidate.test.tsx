// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAvailability } from './useAvailability';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Revalidating when the tab becomes visible again must not blank the slot grid,
 * pile up requests, or let an older answer overwrite a newer one.
 */

type HookResult = ReturnType<typeof useAvailability>;

const dayBody = (available: string[]) =>
  JSON.stringify({ availableSlots: available, bookedTimes: [], lockedTimes: [], pastTimes: [], beyondWindowTimes: [] });

/** A fetch whose responses the test releases by hand, in any order. */
function controlledFetch() {
  const pending: Array<{ url: string; resolve: (r: Response) => void; reject: (e: unknown) => void }> = [];
  const fn = vi.fn(
    (url: string) =>
      new Promise<Response>((resolve, reject) => {
        pending.push({ url, resolve, reject });
      }),
  );
  return { fn, pending };
}

let seq = 0;
/** Unique therapist ids: the prefetch cache in useAvailability is module state. */
const therapist = () => `t-reval-${++seq}`;

let root: Root;
let latest: HookResult;
function Probe({ therapistId, date }: { therapistId: string; date: string }) {
  latest = useAvailability(therapistId, date);
  return null;
}
async function render(therapistId: string, date: string) {
  await act(async () => {
    root.render(<Probe therapistId={therapistId} date={date} />);
  });
}
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let net: ReturnType<typeof controlledFetch>;
beforeEach(() => {
  net = controlledFetch();
  vi.stubGlobal('fetch', net.fn);
  root = createRoot(document.createElement('div'));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useAvailability revalidation', () => {
  it('keeps the slots on screen (no loading) while the tab-focus refetch runs', async () => {
    await render(therapist(), '2026-12-09');
    await act(async () => net.pending[0].resolve(new Response(dayBody(['09:00', '10:00']))));
    await flush();
    expect(latest.slots.map((s) => s.time)).toEqual(['09:00', '10:00']);

    await act(async () => setVisibility('visible'));
    expect(net.fn).toHaveBeenCalledTimes(2);
    expect(latest.loading).toBe(false);
    expect(latest.slots.map((s) => s.time)).toEqual(['09:00', '10:00']);

    await act(async () => net.pending[1].resolve(new Response(dayBody(['10:00']))));
    await flush();
    expect(latest.slots.map((s) => s.time)).toEqual(['10:00']);
  });

  it('does not start another request when the tab regains focus while one is out', async () => {
    await render(therapist(), '2026-12-09');
    await act(async () => net.pending[0].resolve(new Response(dayBody(['09:00']))));
    await flush();

    await act(async () => setVisibility('visible'));
    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    await act(async () => setVisibility('visible'));
    expect(net.fn).toHaveBeenCalledTimes(2);
  });

  it('drops a late answer for the previous date', async () => {
    const t = therapist();
    await render(t, '2026-12-09');
    await render(t, '2026-12-10');
    expect(net.fn).toHaveBeenCalledTimes(2);

    // The newer day answers first; the older one lands afterwards.
    await act(async () => net.pending[1].resolve(new Response(dayBody(['15:00']))));
    await act(async () => net.pending[0].resolve(new Response(dayBody(['09:00']))));
    await flush();
    expect(latest.slots.map((s) => s.time)).toEqual(['15:00']);
    expect(latest.loading).toBe(false);
  });

  it('keeps the shown slots, without an error, when the background refetch fails', async () => {
    await render(therapist(), '2026-12-09');
    await act(async () => net.pending[0].resolve(new Response(dayBody(['09:00']))));
    await flush();

    await act(async () => setVisibility('visible'));
    await act(async () => net.pending[1].resolve(new Response('nope', { status: 500 })));
    await flush();
    expect(latest.slots.map((s) => s.time)).toEqual(['09:00']);
    expect(latest.error).toBeNull();
    expect(latest.loading).toBe(false);
  });

  it('still shows the error when the first load of a day fails', async () => {
    await render(therapist(), '2026-12-09');
    await act(async () => net.pending[0].resolve(new Response('nope', { status: 500 })));
    await flush();
    expect(latest.error).toMatch(/Unable to check slot availability/);
    expect(latest.loading).toBe(false);
  });
});
