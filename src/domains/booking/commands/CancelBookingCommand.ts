import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { SlotReservationService } from '../services/SlotReservationService';

export class CancelBookingCommand implements Command {
  readonly name = 'CancelBookingCommand';
  constructor(
    public readonly bookingId: string,
    public readonly reason: string,
    public readonly cancelledBy: string,
    public readonly sessionRole?: string,
    public readonly customNote?: string,
    public readonly isTokenFlow?: boolean
  ) {}
}

export class CancelBookingCommandHandler implements CommandHandler<CancelBookingCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CancelBookingCommand): Promise<{ success: boolean }> {
    const { bookingId, reason, cancelledBy, sessionRole, customNote, isTokenFlow } = command;
    let isDecline = false;
    let therapistId = '';

    await adminDb.runTransaction(async (t) => {
      const data = await firestoreBookingRepository.findById(bookingId, t);
      if (!data) throw new Error('Booking not found');

      therapistId = data.therapistId;

      // Defense-in-depth Access Control Guard
      if (sessionRole === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
        if (!therapistDoc || !therapistDoc.exists || therapistDoc.data()?.authId !== cancelledBy) {
          throw new Error('Unauthorized to modify this booking');
        }
      } else if (isTokenFlow) {
        if (data.invalidToken) {
          throw new Error('Unauthorized: Booking token is invalidated');
        }
      } else if (cancelledBy) {
        // Authenticated client user must own the booking
        if (data.userId !== cancelledBy && data.email !== cancelledBy) {
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

      // Safe non-blind slot delete using SlotReservationService
      await SlotReservationService.releasePinInTransaction(t, data.therapistId, data.date, data.time, bookingId);
    });

    const outboxEventId = generateDeterministicEventId('booking', bookingId, isDecline ? 'rejected' : 'cancelled');
    OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      console.error('[CancelBookingCommandHandler] Async outbox processing error:', err);
    });

    return { success: true };
  }
}
