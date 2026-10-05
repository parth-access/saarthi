import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/app/api/_lib/logger';
import { razorpayGateway } from './RazorpayGateway';
import { firestoreRefundRepository } from './FirestoreRefundRepository';
import { RefundRepository, RefundRequest } from './RefundRepository';
import { PaymentRefundState, RefundResult } from './PaymentGateway';

/** Narrow view of the gateway methods the refund pipeline needs (both concrete on RazorpayGateway). */
export interface RefundGateway {
  fetchPaymentRefundState(paymentId: string): Promise<PaymentRefundState | null>;
  refundPayment(
    paymentId: string,
    amountPaise: number,
    notes?: Record<string, string | number>,
    receipt?: string
  ): Promise<RefundResult>;
}

export type ProcessRefundOutcome = 'PROCESSED' | 'RECONCILED' | 'FAILED' | 'SKIPPED' | 'NOT_FOUND';

export interface ProcessRefundResult {
  success: boolean;
  outcome: ProcessRefundOutcome;
  refundId?: string;
  amountRefundedPaise?: number;
  error?: string;
}

/**
 * Drives a single refund request to completion against Razorpay. Designed to be
 * called repeatedly (by the process-refunds cron) and to be fully idempotent for
 * money safety:
 *  - a deterministic refund doc id (`refund_<paymentId>`) means one request per payment;
 *  - before issuing, we read Razorpay's authoritative capture/refund state and reconcile
 *    (never issue a second refund if the payment already shows `full`/enough refunded);
 *  - the actual paise amount is computed HERE from Razorpay's captured amount × percent
 *    (floored) — the request only ever stored the percent.
 * A transient failure marks the doc FAILED (still picked up by the retry cron) and never
 * mutates the booking to `refunded`.
 */
export class RefundService {
  constructor(
    private readonly refunds: RefundRepository = firestoreRefundRepository,
    private readonly gateway: RefundGateway = razorpayGateway,
    private readonly db = adminDb
  ) {}

  async processRefund(refundDocId: string): Promise<ProcessRefundResult> {
    const refund = await this.refunds.findById(refundDocId);
    if (!refund) {
      logger.warn('PAYMENT', 'processRefund: refund doc not found', { refundDocId });
      return { success: false, outcome: 'NOT_FOUND' };
    }

    // 1. Already done — idempotent no-op.
    if (refund.status === 'PROCESSED') {
      return { success: true, outcome: 'SKIPPED', refundId: refund.refundId, amountRefundedPaise: refund.amountRefundedPaise };
    }

    // Defensive: a 0%/invalid percent never owes money.
    if (!(refund.refundPercent > 0)) {
      await this.saveRefund(refund, { status: 'PROCESSED', amountRefundedPaise: 0 });
      await this.writeAudit('REFUND_PROCESSED', refund, { amountRefundedPaise: 0, note: 'No refund owed (0%)' });
      return { success: true, outcome: 'PROCESSED', amountRefundedPaise: 0 };
    }

    try {
      // 2. Read authoritative capture/refund state from Razorpay.
      const state = await this.gateway.fetchPaymentRefundState(refund.razorpayPaymentId);
      if (!state) {
        return this.fail(refund, 'Payment not found at gateway');
      }

      const requestedPaise = Math.floor((state.amountPaise * refund.refundPercent) / 100);

      // 3. Idempotency reconcile — never issue a second refund. A fully-refunded payment
      //    reports status 'refunded' (not 'captured'), so this MUST run before the capture check.
      if (state.refundStatus === 'full' || (requestedPaise > 0 && state.amountRefundedPaise >= requestedPaise)) {
        const already = state.amountRefundedPaise || requestedPaise;
        await this.saveRefund(refund, { status: 'PROCESSED', amountRefundedPaise: already });
        await this.markBookingRefunded(refund.bookingId, { refundId: refund.refundId, amountPaise: already });
        await this.writeAudit('REFUND_PROCESSED', refund, {
          amountRefundedPaise: already,
          reconciled: true,
          note: 'Payment already refunded at gateway — reconciled, no new refund issued',
        });
        return { success: true, outcome: 'RECONCILED', refundId: refund.refundId, amountRefundedPaise: already };
      }

      // 4. Must be a captured payment to refund against.
      if (state.status !== 'captured') {
        return this.fail(refund, `Payment not captured (status=${state.status})`);
      }

      if (!(requestedPaise > 0)) {
        return this.fail(refund, `Computed refund amount is ${requestedPaise} paise (nothing to refund)`);
      }

      // 5. Issue the refund. `receipt` = deterministic doc id → traceable + Razorpay-side idempotency hint.
      const result = await this.gateway.refundPayment(
        refund.razorpayPaymentId,
        requestedPaise,
        { bookingId: refund.bookingId, reason: refund.reason, refundDocId },
        refundDocId
      );

      const refundedPaise = result.amount || requestedPaise;
      await this.saveRefund(refund, {
        status: 'PROCESSED',
        refundId: result.id,
        amountRefundedPaise: refundedPaise,
      });
      await this.markBookingRefunded(refund.bookingId, { refundId: result.id, amountPaise: refundedPaise });
      await this.writeAudit('REFUND_PROCESSED', refund, {
        refundId: result.id,
        amountRefundedPaise: refundedPaise,
        gatewayStatus: result.status,
      });

      logger.success('PAYMENT', 'Refund processed', {
        refundDocId,
        bookingId: refund.bookingId,
        refundId: result.id,
        amountRefundedPaise: refundedPaise,
      });
      return { success: true, outcome: 'PROCESSED', refundId: result.id, amountRefundedPaise: refundedPaise };
    } catch (err) {
      return this.fail(refund, err instanceof Error ? err.message : String(err));
    }
  }

  /** Marks the refund FAILED (retryable), bumps attempts, records a REFUND_FAILED audit. Never touches the booking. */
  private async fail(refund: RefundRequest, error: string): Promise<ProcessRefundResult> {
    await this.saveRefund(refund, { status: 'FAILED', attempts: (refund.attempts ?? 0) + 1, error });
    await this.writeAudit('REFUND_FAILED', refund, { error, attempts: (refund.attempts ?? 0) + 1 });
    logger.error('PAYMENT', 'Refund attempt failed (retryable)', null, {
      refundDocId: refund.id,
      bookingId: refund.bookingId,
      error,
    });
    return { success: false, outcome: 'FAILED', error };
  }

  private async saveRefund(refund: RefundRequest, patch: Partial<RefundRequest>): Promise<void> {
    await this.refunds.save({ ...refund, ...patch });
  }

  private async markBookingRefunded(
    bookingId: string,
    { refundId, amountPaise }: { refundId?: string; amountPaise?: number }
  ): Promise<void> {
    if (!this.db) return;
    try {
      const update: Record<string, unknown> = {
        paymentStatus: 'refunded',
        refundStatus: 'refunded',
        refundedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (refundId) update.refundId = refundId;
      if (typeof amountPaise === 'number') update.refundAmount = amountPaise;
      await this.db.collection('bookings').doc(bookingId).update(update);
    } catch (err) {
      // Booking-level visibility is best-effort; the refunds collection remains source of truth.
      logger.warn('PAYMENT', 'Failed to mark booking refunded (refund itself succeeded)', {
        bookingId,
        error: String(err),
      });
    }
  }

  private async writeAudit(
    eventType: 'REFUND_PROCESSED' | 'REFUND_FAILED',
    refund: RefundRequest,
    extra: Record<string, unknown>
  ): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.collection('audit_logs').add({
        eventType,
        bookingId: refund.bookingId,
        razorpayPaymentId: refund.razorpayPaymentId,
        razorpayOrderId: refund.razorpayOrderId ?? null,
        reason: refund.reason,
        refundPercent: refund.refundPercent,
        refundDocId: refund.id,
        ...extra,
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.error('PAYMENT', `Failed to write ${eventType} audit`, err, { bookingId: refund.bookingId });
    }
  }
}

export const refundService = new RefundService();
