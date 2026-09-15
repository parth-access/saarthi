import { adminDb } from '@/lib/firebase/admin';
import { CreateBookingCommand, CreateBookingCommandHandler } from '@/domains/booking/commands/CreateBookingCommand';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { logger } from '@/app/api/_lib/logger';

/**
 * Therapist-scheduled follow-up sessions.
 *
 * A follow-up is NOT a special booking path: it runs the canonical
 * CreateBookingCommand (slot lock transaction, availability checks, 45-minute
 * duration, pricing, Razorpay order, outbox events, confirmation email, calendar
 * creation — all preserved). This service adds only:
 *   1. authorization — the acting therapist must own the SOURCE session
 *   2. validation    — the source session must be completed
 *   3. linkage       — the new booking carries previousBookingId
 *
 * Pricing/payment rules are intentionally NOT modified here: the follow-up goes
 * through the same `calculateBookingPrice` + Razorpay order flow as any booking.
 */

export interface ScheduleFollowUpInput {
  sourceBookingId: string;
  /** New session slot (IST). */
  date: string;
  /** 24-hour zero-padded, e.g. '14:30'. */
  time: string;
  therapist: {
    uid: string;
    role: string;
  };
  /** Optional pre-filled client details; missing fields fall back to the source booking. */
  overrides?: {
    name?: string;
    phone?: string;
    email?: string;
    sessionMode?: string;
    sessionType?: string;
    message?: string;
    gender?: string;
    age?: number;
  };
}

export interface ScheduleFollowUpResult {
  success: boolean;
  bookingId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export class FollowUpBookingService {
  static async scheduleFollowUp(input: ScheduleFollowUpInput): Promise<ScheduleFollowUpResult> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    const { sourceBookingId, date, time, therapist, overrides } = input;

    try {
      // 1. Load and authorize the source session.
      const sourceBooking = await firestoreBookingRepository.findById(sourceBookingId);
      if (!sourceBooking) {
        return { success: false, error: 'Source session not found' };
      }

      if (therapist.role !== 'admin') {
        if (therapist.role !== 'therapist') {
          return { success: false, error: 'Unauthorized: Only therapists can schedule follow-up sessions' };
        }
        const therapistDoc = await adminDb.collection('therapists').doc(sourceBooking.therapistId).get();
        if (!therapistDoc.exists) {
          return { success: false, error: 'Unauthorized: Therapist record not found' };
        }
        const data = therapistDoc.data();
        if (data?.authId !== therapist.uid && data?.id !== therapist.uid) {
          return { success: false, error: 'Unauthorized: You can only schedule follow-ups for your own sessions' };
        }
      }

      // 2. The source session must be concluded.
      if (sourceBooking.status !== 'completed') {
        return { success: false, error: `Follow-ups can only be scheduled after a session is completed. Current status is '${sourceBooking.status}'` };
      }

      // Guard against following up the wrong client: the new booking belongs to
      // the same user as the source session.
      const clientEmail = overrides?.email || sourceBooking.email;
      const clientName = overrides?.name || sourceBooking.name;
      const clientPhone = overrides?.phone || sourceBooking.phone;

      if (!clientEmail) {
        return { success: false, error: 'Client email is required to schedule a follow-up' };
      }

      // 3. Build the canonical booking payload. Slot validation (past/window/
      // availability/45-minute duration/concurrency) is enforced inside
      // CreateBookingCommandHandler — we deliberately do not duplicate it.
      const command = new CreateBookingCommand(
        {
          therapistId: sourceBooking.therapistId,
          name: clientName,
          phone: clientPhone || '',
          date,
          time,
          email: clientEmail,
          sessionMode: overrides?.sessionMode || sourceBooking.sessionMode,
          sessionType: overrides?.sessionType || sourceBooking.sessionType,
          message: overrides?.message,
          gender: overrides?.gender || sourceBooking.gender,
          age: overrides?.age ?? (typeof sourceBooking.age === 'number' ? sourceBooking.age : undefined),
          previousBookingId: sourceBookingId,
        },
        sourceBooking.userId || '',
        clientEmail
      );

      const handler = new CreateBookingCommandHandler();
      const result = await handler.execute(command);

      logger.info('FOLLOWUP', `Follow-up booking ${result.bookingId} scheduled for source session ${sourceBookingId}`, {
        therapistId: sourceBooking.therapistId,
        date,
        time,
      });

      return {
        success: true,
        bookingId: result.bookingId,
        orderId: result.orderId,
        amount: result.amount,
        currency: result.currency,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('FOLLOWUP', `Failed to schedule follow-up for source session ${sourceBookingId}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }
}
