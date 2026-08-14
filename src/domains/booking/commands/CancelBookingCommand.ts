import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { sendEmailAction } from '@/app/api/email/emailSender';

export class CancelBookingCommand implements Command {
  readonly name = 'CancelBookingCommand';
  constructor(
    public readonly bookingId: string,
    public readonly reason: string,
    public readonly cancelledBy: string,
    public readonly sessionRole?: string,
    public readonly customNote?: string
  ) {}
}

export class CancelBookingCommandHandler implements CommandHandler<CancelBookingCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CancelBookingCommand): Promise<{ success: boolean }> {
    const { bookingId, reason, cancelledBy, sessionRole, customNote } = command;
    let isDecline = false;
    let therapistId = '';

    await adminDb.runTransaction(async (t) => {
      const data = await firestoreBookingRepository.findById(bookingId, t);
      if (!data) throw new Error('Booking not found');

      therapistId = data.therapistId;

      if (sessionRole === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
        if (!therapistDoc || !therapistDoc.exists || therapistDoc.data()?.authId !== cancelledBy) {
          throw new Error('Unauthorized to modify this booking');
        }
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

      const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);
      t.delete(slotRef);
    });

    const outboxEventId = generateDeterministicEventId('booking', bookingId, isDecline ? 'rejected' : 'cancelled');
    OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      console.error('[CancelBookingCommandHandler] Async outbox processing error:', err);
    });

    if (isDecline && therapistId) {
      try {
        await sendEmailAction({
          type: 'booking-declined',
          bookingId,
          therapistId,
          declineReason: reason,
          declineCustomNote: customNote
        });
      } catch (err) {
        console.error('Failed to send decline email:', err);
      }
    }

    return { success: true };
  }
}


