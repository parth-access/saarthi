import { describe, it, expect, vi } from 'vitest';

/**
 * Firestore here rejects any document holding `undefined`, and a therapist's
 * decline without a note carries `customNote: undefined`. The timeline entry
 * must still be written, minus that field, rather than dropped.
 */
const h = vi.hoisted(() => ({ set: vi.fn().mockResolvedValue(undefined), error: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ doc: () => ({ id: 'tl_1', set: h.set }) }) },
}));
vi.mock('@/shared/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: h.error } }));

import { registerTimelineListeners } from './TimelineListener';

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).some(hasUndefined);
  }
  return false;
}

describe('timeline entries', () => {
  it('records a decline with no custom note, without any undefined field', async () => {
    const listeners: Record<string, (event: unknown) => Promise<void>> = {};
    registerTimelineListeners({ subscribe: (name: string, fn: (event: unknown) => Promise<void>) => (listeners[name] = fn) });

    await listeners.BookingRejected({
      name: 'BookingRejected',
      correlationId: 'c1',
      payload: { bookingId: 'bk_1', declinedBy: 'therapist', declineReason: 'Not available at this time' },
    });

    expect(h.set).toHaveBeenCalledTimes(1);
    const written = h.set.mock.calls[0][0];
    expect(hasUndefined(written)).toBe(false);
    expect(written.metadata).toEqual({ reason: 'Not available at this time' });
    expect(h.error).not.toHaveBeenCalled();
  });
});
