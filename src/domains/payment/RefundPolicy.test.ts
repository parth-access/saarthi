import { describe, it, expect } from 'vitest';
import { computeRefundPercent, FULL_REFUND_CUTOFF_MS, HALF_REFUND_CUTOFF_MS } from './RefundPolicy';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-01-01T00:00:00Z');

describe('RefundPolicy.computeRefundPercent', () => {
  it('refunds 100% when cancelling well over 48h before the session', () => {
    expect(computeRefundPercent(NOW + 72 * HOUR, NOW)).toBe(100);
  });

  it('refunds 100% exactly at the 48h boundary (inclusive)', () => {
    expect(computeRefundPercent(NOW + FULL_REFUND_CUTOFF_MS, NOW)).toBe(100);
  });

  it('refunds 50% between 24h and 48h before the session', () => {
    expect(computeRefundPercent(NOW + 36 * HOUR, NOW)).toBe(50);
  });

  it('refunds 50% exactly at the 24h boundary (inclusive)', () => {
    expect(computeRefundPercent(NOW + HALF_REFUND_CUTOFF_MS, NOW)).toBe(50);
  });

  it('refunds 0% just under 24h before the session', () => {
    expect(computeRefundPercent(NOW + HALF_REFUND_CUTOFF_MS - 1, NOW)).toBe(0);
  });

  it('refunds 0% just under the 48h boundary (falls to 50 tier, not 100)', () => {
    expect(computeRefundPercent(NOW + FULL_REFUND_CUTOFF_MS - 1, NOW)).toBe(50);
  });

  it('refunds 0% for a session already in the past', () => {
    expect(computeRefundPercent(NOW - HOUR, NOW)).toBe(0);
  });

  it('fails safe to 0% on non-finite inputs (never over-refunds bad data)', () => {
    expect(computeRefundPercent(NaN, NOW)).toBe(0);
    expect(computeRefundPercent(NOW + 72 * HOUR, NaN)).toBe(0);
  });
});
