import { describe, it, expect } from 'vitest';
import { hasLapsedUnpaidHold } from './holdLapse';

const NOW = Date.parse('2026-09-01T10:00:00.000Z');
const past = new Date(NOW - 1);
const future = new Date(NOW + 60_000);

describe('hasLapsedUnpaidHold', () => {
  it('frees an unpaid awaiting_payment booking once its hold has passed', () => {
    expect(hasLapsedUnpaidHold({ status: 'awaiting_payment', paymentStatus: 'pending', holdExpiresAt: past }, NOW)).toBe(true);
  });

  it('keeps blocking while the hold is still running', () => {
    expect(hasLapsedUnpaidHold({ status: 'awaiting_payment', paymentStatus: 'pending', holdExpiresAt: future }, NOW)).toBe(false);
  });

  it('never frees a confirmed or paid booking, whatever its hold says', () => {
    expect(hasLapsedUnpaidHold({ status: 'confirmed', paymentStatus: 'paid', holdExpiresAt: past }, NOW)).toBe(false);
    expect(hasLapsedUnpaidHold({ status: 'awaiting_payment', paymentStatus: 'paid', holdExpiresAt: past }, NOW)).toBe(false);
    expect(hasLapsedUnpaidHold({ status: 'pending_approval', paymentStatus: 'pending', holdExpiresAt: past }, NOW)).toBe(false);
  });

  it('keeps blocking when the hold is missing or unreadable', () => {
    expect(hasLapsedUnpaidHold({ status: 'awaiting_payment', paymentStatus: 'pending', holdExpiresAt: null }, NOW)).toBe(false);
    expect(hasLapsedUnpaidHold({ status: 'awaiting_payment', paymentStatus: 'pending', holdExpiresAt: 'soon' }, NOW)).toBe(false);
  });

  it('reads Firestore timestamps, ISO strings and epoch millis', () => {
    const base = { status: 'awaiting_payment' as const, paymentStatus: 'pending' as const };
    expect(hasLapsedUnpaidHold({ ...base, holdExpiresAt: { toMillis: () => NOW - 1 } }, NOW)).toBe(true);
    expect(hasLapsedUnpaidHold({ ...base, holdExpiresAt: { toDate: () => past } }, NOW)).toBe(true);
    expect(hasLapsedUnpaidHold({ ...base, holdExpiresAt: past.toISOString() }, NOW)).toBe(true);
    expect(hasLapsedUnpaidHold({ ...base, holdExpiresAt: NOW - 1 }, NOW)).toBe(true);
  });
});
