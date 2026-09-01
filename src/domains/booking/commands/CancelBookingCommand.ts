import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { SlotReservationService } from '../services/SlotReservationService';
import { computeRefundPercent, firestoreRefundRepository } from '@/domains/payment';
import { parseSessionTimeIST } from '@/services/googleCalendarService';
import { Booking } from '../entities/Booking';

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
}

export class CancelBookingCommandHandler implements CommandHandler<CancelBookingCommand, CancelBookingResult> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CancelBookingCommand): Promise<CancelBookingResult> {
    const { bookingId, reason, cancelledBy, sessionRole, customNote, isTokenFlow, ownerEmail } = command;
    let isDecline = false;
    let therapistId = '';
    let refundPercent = 0;
    let refundEnqueued = false;

    await adminDb.runTransaction(async (t) => {
      const data = await firestoreBookingRepository.findById(bookingId, t);
      if (!data) throw new Error('Booking not found');

      therapistId = data.therapistId;

      // Defense-in-depth Access Control Guard
      if (sessionRole === 'admin') {
        // Admin is authorized to cancel or decline any booking
      } else if (sessionRole === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
        if (!therapistDoc || !therapistDoc.exists || therapistDoc.data()?.authId !== cancelledBy) {
          throw new Error('Unauthorized to modify this booking');
        }
      } else if (isTokenFlow) {
        if (data.invalidToken) {
          throw new Error('Unauthorized: Booking token is invalidated');
        }
      } else if (cancelledBy || ownerEmail) {
        // Authenticated client user must own the booking (by uid or verified email).
        const ownsByUid =
          !!cancelledBy && (data.userId === cancelledBy || data.email === cancelledBy);
        const ownsByEmail =
          !!ownerEmail &&
          !!data.email &&
          data.email.toLowerCase() === ownerEmail.toLowerCase();
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

      // Idempotency: prevent re-cancelling already cancelled/rejected bookings
      if (data.status === 'cancelled' || data.status === 'rejected') {
        return;
      }

      // If booking is pending/awaiting_payment/confirmed, we can decline/cancel
      isDecline = data.status === 'pending' || data.status === 'pending_approval' || data.status === 'awaiting_payment';

      // Refund decision for a PAID (previously confirmed) booking being cancelled.
      // Computed BEFORE the cancellation writes below and enqueued inside the same
      // transaction (read-before-write: enqueue reads its create-guarded doc up-front)
      // so cancel + refund-enqueue commit atomically. Percent is fixed by the
      // time-to-session policy at THIS moment; the actual paise are computed later
      // from Razorpay's authoritative captured amount by the process-refunds cron.
      let refundNote = '';
      if (
        !isDecline &&
        data.paymentStatus === 'paid' &&
        data.razorpayPaymentId &&
        !data.razorpayPaymentId.startsWith('mock_')
      ) {
        const percent = computeRefundPercent(resolveSessionStartMs(data), Date.now());
        refundPercent = percent;
        if (percent > 0) {
          await firestoreRefundRepository.enqueue(
            {
              id: firestoreRefundRepository.refundIdForPayment(data.razorpayPaymentId),
              bookingId,
              razorpayPaymentId: data.razorpayPaymentId,
              razorpayOrderId: data.razorpayOrderId,
              refundPercent: percent,
              reason: 'cancellation',
            },
            t
          );
          refundEnqueued = true;
          refundNote = `Refund enqueued at ${percent}% per cancellation policy`;
        } else {
          refundNote = 'No refund per cancellation policy (<24h to session start)';
        }
      }

      if (isDecline) {
        await this.bookingDomainService.declineBooking(
          data,
          reason,
          cancelledBy,
          customNote,
          FieldValue.serverTimestamp(),
          t
        );
      } else {
        await this.bookingDomainService.cancelBooking(data, reason, t);
      }

      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, t);

      // Human audit trail for the refund decision (enqueued or intentionally skipped).
      if (refundNote) {
        const refundAuditRef = adminDb.collection('audit_logs').doc();
        t.set(refundAuditRef, {
          eventType: 'REFUND_POLICY_APPLIED',
          bookingId,
          therapistId: data.therapistId,
          razorpayPaymentId: data.razorpayPaymentId,
          cancelledBy,
          timestamp: FieldValue.serverTimestamp(),
          details: refundNote,
        });
      }

      // Safe non-blind slot delete using SlotReservationService
      await SlotReservationService.releasePinInTransaction(t, data.therapistId, data.date, data.time, bookingId);
    });

    const outboxEventId = generateDeterministicEventId('booking', bookingId, isDecline ? 'rejected' : 'cancelled');
    await OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      console.error('[CancelBookingCommandHandler] Async outbox processing error:', err);
    });

    return {
      success: true,
      outcome: isDecline ? 'rejected' : 'cancelled',
      refundPercent,
      refundEnqueued,
    };
  }
}
