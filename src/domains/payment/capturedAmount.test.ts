import { describe, it, expect } from 'vitest';
import { assertCapturedAmountMatches, CapturedAmountError, rupeesToPaise } from './capturedAmount';

const ORDER = 'order_ABC123';
const check = (expectedRupees: unknown, amount: unknown, order_id: unknown = ORDER) =>
  () => assertCapturedAmountMatches({ expectedRupees, captured: { amount, order_id }, orderId: ORDER });

describe('assertCapturedAmountMatches', () => {
  it('accepts the exact paise for the booking price', () => {
    expect(check(1500, 150000)).not.toThrow();
  });

  it('rejects the rupee figure paid as paise (₹15 for a ₹1,500 session)', () => {
    expect(check(1500, 1500)).toThrow(CapturedAmountError);
    expect(check(1500, 1500)).toThrow(/expected 150000 paise, got 1500/);
  });

  it('rejects underpayment and overpayment by a single paisa', () => {
    expect(check(1500, 149999)).toThrow(CapturedAmountError);
    expect(check(1500, 150001)).toThrow(CapturedAmountError);
  });

  it('fails closed when Razorpay reports no usable amount', () => {
    expect(check(1500, undefined)).toThrow(/did not report a captured amount/);
    expect(check(1500, 0 / 0)).toThrow(CapturedAmountError);
    expect(check(1500, '150000')).toThrow(CapturedAmountError);
    expect(check(1500, 1500.5)).toThrow(CapturedAmountError);
  });

  it('fails closed when the booking has no valid price', () => {
    expect(check(undefined, 150000)).toThrow(/no valid price/);
    expect(check(0, 0)).toThrow(/no valid price/);
    expect(check(-1500, -150000)).toThrow(/no valid price/);
  });

  it('rejects a payment captured for a different order', () => {
    expect(check(1500, 150000, 'order_OTHER')).toThrow(/different order/);
  });

  it('handles paise rounding for non-round rupee prices', () => {
    expect(rupeesToPaise(1499.99)).toBe(149999);
    expect(check(1499.99, 149999)).not.toThrow();
  });
});
