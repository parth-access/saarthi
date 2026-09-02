export type RefundStatus = 'PENDING' | 'PROCESSED' | 'FAILED';export type RefundReason = 'double_booking' | 'cancellation';

export interface RefundRequest {
  /** Deterministic id: `refund_<razorpayPaymentId>` — one refund per payment. */
  id: string;
  bookingId: string;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  /** Percentage of the captured amount to refund (100 for double-booking). */
  refundPercent: number;
  reason: RefundReason;
  status: RefundStatus;
  attempts: number;
  refundId?: string;
  amountRefundedPaise?: number;
  error?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RefundRepository {
  /** Deterministic doc id for a payment's refund request. */
  refundIdForPayment(razorpayPaymentId: string): string;
  /**
   * Idempotently enqueue a refund request in its own transaction. If a doc for
   * this payment already exists, this is a no-op (returns false) — never creates
   * a duplicate refund.
   *
   * To enqueue inside a caller's transaction, use the concrete repository's
   * `readEnqueuePlan` / `applyEnqueue` pair so the create-guard read happens in
   * that transaction's read phase.
   */
  enqueue(request: Omit<RefundRequest, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>): Promise<boolean>;
  findById(id: string): Promise<RefundRequest | null>;
  save(request: RefundRequest): Promise<void>;
  /** Refunds still owed (PENDING) or transiently failed (FAILED), for the retry cron. */
  findRefundsNeedingProcessing(limitCount?: number): Promise<RefundRequest[]>;
  findByPaymentId(razorpayPaymentId: string): Promise<RefundRequest | null>;
}
