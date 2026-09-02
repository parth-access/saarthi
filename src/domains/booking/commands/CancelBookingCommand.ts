import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { SlotReservationService, PinReleasePlan } from '../services/SlotReservationService';
import { computeRefundPercent, firestoreRefundRepository } from '@/domains/payment';
import type { RefundEnqueuePlan } from '@/domains/payment/FirestoreRefundRepository';
import { parseSessionTimeIST } from '@/services/googleCalendarService';
import { Booking } from '../entities/Booking';
import { runPlannedTransaction, TxReader, TxWriter } from '@/shared/firestore/transactionPhases';

/**
 * Best-effort resolution of the session's start instant (ms) for the refund
 * policy. Prefers the stored UTC timestamp; falls back to the IST-localized
 * date/time. Returns NaN when neither can be parsed — computeRefundPercent then
 * fails safe to 0% (never over-refunds on unparseable data).
 */
function resolveSessionStartMs(data: Booking): number {
  if (data.utcDateTime) {
    const t = Date.parse(String(data.utcDateTime));
    if (Number.isFinite(t)) return t;
  }
  try {
    const { startIso } = parseSessionTimeIST(data.date, data.time);
    return Date.parse(startIso);
  } catch {
    return NaN;
  }
}

export class CancelBookingCommand implements Command {
  readonly name = 'CancelBookingCommand';
  constructor(
    public readonly bookingId: string,
    public readonly reason: string,
    public readonly cancelledBy: string,
    public readonly sessionRole?: string,
    public readonly customNote?: string,
    public readonly isTokenFlow?: boolean,
    /**
     * Verified session email (from verifySession). Authorizes bookings that were
     * created unauthenticated and carry only an `email` (no `userId`), mirroring
     * the userId-OR-email ownership model used by join-session.
     */
    public readonly ownerEmail?: string
  ) {}
}

export interface CancelBookingResult {
  success: boolean;
  /** 'cancelled' for confirmed bookings, 'rejected' for pending/awaiting declines. */
  outcome: 'cancelled' | 'rejected';
  /** Refund percent enqueued per the cancellation policy (0 when none). */
  refundPercent: number;
  /** True when a refund was actually enqueued for processing. */
  refundEnqueued: boolean;
  /** True when the booking was already cancelled/rejected and nothing was written. */
  alreadySettled: boolean;
}

/**
 * Everything resolved during the transaction's READ phase. Once this exists the
 * write phase is pure writes — no `get` is reachable there, because the write
 * phase only receives a {@link TxWriter}.
 */
interface CancelPlan {
  /** True when there is nothing left to do (already cancelled/rejected). */
  alreadySettled: boolean;
  booking: Booking;
  /** Decline (pending/awaiting) vs cancel (confirmed). */
  isDecline: boolean;
  refundPercent: number;
  /** Present only when a refund is actually owed by policy. */
  refundEnqueuePlan: RefundEnqueuePlan | null;
  /** Human-readable audit line for the refund decision, '' when not applicable. */
  refundNote: string;
  pinRelease: PinReleasePlan;
}

/**
 * Single cancellation path for BOTH the client self-service route
 * (`/api/bookings/cancel-self`) and the admin route
 * (`/api/bookings/update-status` with `cancelled`/`rejected`). There is
 * deliberately one implementation: the production 500 appeared in both places
 * because both funnel through this handler, so both are fixed by the same
 * read/write phase split.
 */
export class CancelBookingCommandHandler implements CommandHandler<CancelBookingCommand, CancelBookingResult> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CancelBookingCommand): Promise<CancelBookingResult> {
    const { bookingId } = command;

    const result = await runPlannedTransaction<CancelPlan, CancelBookingResult>(adminDb, {
      read: (reader) => this.readPlan(reader, command),
      write: (writer, plan) => this.applyPlan(writer, plan, command),
    });

    if (!result.alreadySettled) {
      // Best-effort nudge. The outbox row committed with the cancellation, so the
      // process-outbox cron still delivers it if this call fails.
      const outboxEventId = generateDeterministicEventId(
        'booking',
        bookingId,
        result.outcome === 'rejected' ? 'rejected' : 'cancelled'
      );
      await OutboxProcessor.processEvent(outboxEventId).catch((err) => {
        console.error('[CancelBookingCommandHandler] Async outbox processing error:', err);
      });
    }

    return result;
  }

  /**
   * READ PHASE — authorization, status guards, refund eligibility and every
   * document lookup the write phase depends on. Throws here, before any write,
   * for unauthorized or ineligible requests.
   */
  private async readPlan(reader: TxReader, command: CancelBookingCommand): Promise<CancelPlan> {
    const { bookingId, cancelledBy, sessionRole, isTokenFlow, ownerEmail } = command;

    const data = await firestoreBookingRepository.findById(bookingId, reader);
    if (!data) throw new Error('Booking not found');

    // Defense-in-depth Access Control Guard
    if (sessionRole === 'admin') {
      // Admin is authorized to cancel or decline any booking
    } else if (sessionRole === 'therapist') {
      const therapistDoc = await reader.get(adminDb.collection('therapists').doc(data.therapistId));
      if (!therapistDoc || !therapistDoc.exists || therapistDoc.data()?.authId !== cancelledBy) {
        throw new Error('Unauthorized to modify this booking');
      }
    } else if (isTokenFlow) {
      if (data.invalidToken) {
        throw new Error('Unauthorized: Booking token is invalidated');
      }
    } else if (cancelledBy || ownerEmail) {
      // Authenticated client user must own the booking (by uid or verified email).
      const ownsByUid = !!cancelledBy && (data.userId === cancelledBy || data.email === cancelledBy);
      const ownsByEmail =
        !!ownerEmail && !!data.email && data.email.toLowerCase() === ownerEmail.toLowerCase();
      if (!ownsByUid && !ownsByEmail) {
        throw new Error('Unauthorized: Client ownership mismatch');
      }
    } else {
      throw new Error('Unauthorized: Cancel request requires a valid session or token context.');
    }

    // Block cancellation/decline of completed/no_show bookings
    if (data.status === 'completed' || data.status === 'no_show') {
      throw new Error('Cannot cancel or decline a completed or no-show booking');
    }

    // Idempotency: never re-cancel an already cancelled/rejected booking. Still a
    // valid plan so the write phase can no-op cleanly instead of throwing.
    const alreadySettled = data.status === 'cancelled' || data.status === 'rejected';

    // Pending/awaiting bookings are *declined*; paid/confirmed ones are *cancelled*.
    const isDecline =
      data.status === 'pending' || data.status === 'pending_approval' || data.status === 'awaiting_payment';

    // Refund decision for a PAID (previously confirmed) booking being cancelled.
    // The percent is fixed by the time-to-session policy at THIS moment; the
    // actual paise are computed later from Razorpay's authoritative captured
    // amount by the process-refunds cron. The "<24h ⇒ no refund" rule is enforced
    // HERE, server-side; the dashboard copy only mirrors this decision.
    let refundPercent = 0;
    let refundNote = '';
    let refundEnqueuePlan: RefundEnqueuePlan | null = null;

    if (
      !alreadySettled &&
      !isDecline &&
      data.paymentStatus === 'paid' &&
      data.razorpayPaymentId &&
      !data.razorpayPaymentId.startsWith('mock_')
    ) {
      refundPercent = computeRefundPercent(resolveSessionStartMs(data), Date.now());
      if (refundPercent > 0) {
        refundEnqueuePlan = await firestoreRefundRepository.readEnqueuePlan(
          {
            id: firestoreRefundRepository.refundIdForPayment(data.razorpayPaymentId),
            bookingId,
            razorpayPaymentId: data.razorpayPaymentId,
            razorpayOrderId: data.razorpayOrderId,
            refundPercent,
            reason: 'cancellation',
          },
          reader
        );
        refundNote = `Refund enqueued at ${refundPercent}% per cancellation policy`;
      } else {
        refundNote = 'No refund per cancellation policy (<24h to session start)';
      }
    }

    // Last read: the slot pin. Previously this lookup happened AFTER the
    // cancellation writes, which is exactly what produced the production
    // "Firestore transactions require all reads to be executed before all
    // writes" 500 on both /api/bookings/cancel-self and the admin path.
    const pinRelease = await SlotReservationService.readPinReleasePlan(
      reader,
      data.therapistId,
      data.date,
      data.time,
      bookingId
    );

    return { alreadySettled, booking: data, isDecline, refundPercent, refundEnqueuePlan, refundNote, pinRelease };
  }

  /**
   * WRITE PHASE — pure writes against a {@link TxWriter}. A read is not even
   * expressible here, which is what makes the read-after-write violation
   * unrepresentable rather than merely absent.
   */
  private async applyPlan(
    writer: TxWriter,
    plan: CancelPlan,
    command: CancelBookingCommand
  ): Promise<CancelBookingResult> {
    const { booking, isDecline } = plan;
    const { bookingId, reason, cancelledBy, customNote } = command;

    if (plan.alreadySettled) {
      return {
        success: true,
        outcome: booking.status === 'rejected' ? 'rejected' : 'cancelled',
        refundPercent: 0,
        refundEnqueued: false,
        alreadySettled: true,
      };
    }

    let refundEnqueued = false;
    if (plan.refundEnqueuePlan) {
      refundEnqueued = firestoreRefundRepository.applyEnqueue(writer, plan.refundEnqueuePlan);
    }

    // These persist the booking and record the outbox event; both are write-only.
    if (isDecline) {
      // `declinedAt` is a top-level field, so a serverTimestamp sentinel is legal.
      await this.bookingDomainService.declineBooking(
        booking,
        reason,
        cancelledBy,
        customNote,
        FieldValue.serverTimestamp(),
        writer
      );
    } else {
      await this.bookingDomainService.cancelBooking(booking, reason, writer);
    }

    // Human audit trail for the refund decision (enqueued or intentionally skipped).
    if (plan.refundNote) {
      const refundAuditRef = adminDb.collection('audit_logs').doc();
      writer.set(refundAuditRef, {
        eventType: 'REFUND_POLICY_APPLIED',
        bookingId,
        therapistId: booking.therapistId,
        razorpayPaymentId: booking.razorpayPaymentId ?? null,
        cancelledBy,
        refundPercent: plan.refundPercent,
        timestamp: FieldValue.serverTimestamp(),
        details: plan.refundNote,
      });
    }

    // Ownership-checked (never blind) slot release, decided during the read phase.
    SlotReservationService.applyPinRelease(writer, plan.pinRelease);

    return {
      success: true,
      outcome: isDecline ? 'rejected' : 'cancelled',
      refundPercent: plan.refundPercent,
      refundEnqueued,
      alreadySettled: false,
    };
  }
}
