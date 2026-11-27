/**
 * Checks Razorpay's captured payment against the order we created, before a
 * booking is confirmed. Pure and synchronous so it can be tested on its own.
 *
 * Units: our Payment stores the price in RUPEES (orders are created with
 * `amount * 100`), and Razorpay always reports PAISE. The only valid match is
 * therefore exact paise. Every unclear case fails closed: a payment we cannot
 * prove is correct is never confirmed.
 */
export interface CapturedPayment {
  amount?: unknown;
  order_id?: unknown;
}

export class CapturedAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapturedAmountError';
  }
}

export function rupeesToPaise(rupees: number): number {
  // Round, so a price like 1499.99 does not become 149998.99999… paise.
  return Math.round(rupees * 100);
}

export function assertCapturedAmountMatches(params: {
  expectedRupees: unknown;
  captured: CapturedPayment;
  orderId: string;
}): void {
  const { expectedRupees, captured, orderId } = params;

  if (typeof expectedRupees !== 'number' || !Number.isFinite(expectedRupees) || expectedRupees <= 0) {
    throw new CapturedAmountError('Payment amount mismatch: the booking has no valid price to check against');
  }
  if (typeof captured.amount !== 'number' || !Number.isInteger(captured.amount)) {
    throw new CapturedAmountError('Payment amount mismatch: Razorpay did not report a captured amount');
  }

  const expectedPaise = rupeesToPaise(expectedRupees);
  if (captured.amount !== expectedPaise) {
    throw new CapturedAmountError(
      `Payment amount mismatch: expected ${expectedPaise} paise, got ${captured.amount}`,
    );
  }

  if (typeof captured.order_id === 'string' && captured.order_id !== orderId) {
    throw new CapturedAmountError('Payment belongs to a different order');
  }
}
