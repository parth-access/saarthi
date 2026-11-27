import { describe, it, expect } from 'vitest';
import { canClientReschedule } from './ReschedulePolicy';
import { computeRefundPercent } from '@/domains/payment/RefundPolicy';

const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 28, 6, 0);

describe('canClientReschedule', () => {
  it('allows a session well over 24 hours away', () => {
    expect(canClientReschedule(now + 72 * HOUR, now)).toBe(true);
  });

  it('blocks a session a few hours away', () => {
    expect(canClientReschedule(now + 2 * HOUR, now)).toBe(false);
  });

  it('blocks a session that has already started', () => {
    expect(canClientReschedule(now - HOUR, now)).toBe(false);
  });

  it('allows exactly 24 hours ahead, and blocks one millisecond less', () => {
    expect(canClientReschedule(now + 24 * HOUR, now)).toBe(true);
    expect(canClientReschedule(now + 24 * HOUR - 1, now)).toBe(false);
  });

  it('fails closed when the start time is unknown', () => {
    expect(canClientReschedule(NaN, now)).toBe(false);
    expect(canClientReschedule(now + 72 * HOUR, NaN)).toBe(false);
  });

  it('cuts off at the same instant the refund drops to 50%', () => {
    for (const hours of [23.99, 24, 24.01, 47, 48, 72]) {
      const start = now + hours * HOUR;
      expect(canClientReschedule(start, now)).toBe(computeRefundPercent(start, now) >= 50);
    }
  });
});
