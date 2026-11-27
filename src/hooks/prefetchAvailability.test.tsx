// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFETCH_TTL_MS, prefetchAvailability, useAvailability } from './useAvailability';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const body = { availableSlots: ['09:00', '10:00'], bookedTimes: [], lockedTimes: ['11:00'], pastTimes: [], beyondWindowTimes: [] };
const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body))));

let seq = 0;
/** Unique ids per test: the prefetch cache is module state shared across tests. */
const ids = () => ({ therapistId: `t-pre-${++seq}`, date: '2026-12-09' });

type HookResult = ReturnType<typeof useAvailability>;
async function mountHook(therapistId: string, date: string): Promise<{ latest: () => HookResult; unmount: () => void }> {
  let latest: HookResult | null = null;
  const Probe = () => {
    latest = useAvailability(therapistId, date);
    return null;
  };
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { latest: () => latest as unknown as HookResult, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('prefetchAvailability', () => {
  it('starts one request per therapist and day, even when the day is clicked twice', () => {
    const { therapistId, date } = ids();
    prefetchAvailability(therapistId, date);
    prefetchAvailability(therapistId, date);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
      `/api/availability?therapistId=${therapistId}&date=${date}`,
    );
  });

  it('does nothing without a therapist or a date', () => {
    prefetchAvailability('', '2026-12-09');
    prefetchAvailability('t', null);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useAvailability with a prefetched day', () => {
  it('uses the prefetched response instead of fetching again', async () => {
    const { therapistId, date } = ids();
    prefetchAvailability(therapistId, date);
    const hook = await mountHook(therapistId, date);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hook.latest().slots.map((s) => [s.time, s.isAvailable])).toEqual([
      ['09:00', true],
      ['10:00', true],
      ['11:00', false],
    ]);
    hook.unmount();
  });

  it('uses a prefetch only once: a refetch goes to the server', async () => {
    const { therapistId, date } = ids();
    prefetchAvailability(therapistId, date);
    const hook = await mountHook(therapistId, date);
    await act(async () => {
      hook.latest().refetch();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('ignores a prefetch older than the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { therapistId, date } = ids();
    prefetchAvailability(therapistId, date);
    vi.setSystemTime(Date.now() + PREFETCH_TTL_MS + 1);
    const hook = await mountHook(therapistId, date);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('falls back to a fresh request when the prefetch failed', async () => {
    const { therapistId, date } = ids();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    prefetchAvailability(therapistId, date);
    const hook = await mountHook(therapistId, date);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hook.latest().error).toBeNull();
    expect(hook.latest().slots).toHaveLength(3);
    hook.unmount();
  });
});
