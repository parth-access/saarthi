import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { BookingStateMachine } from '../state/BookingStateMachine';
import { Booking } from '../entities/Booking';
import { sendEmailAction } from '@/app/api/email/emailSender';

export interface AdminConfirmBookingSessionContext {
  uid?: string;
  role?: string;
}

export class AdminConfirmBookingCommand implements Command {
  readonly name = 'AdminConfirmBookingCommand';

  constructor(
    public readonly bookingId: string,
    public readonly session: AdminConfirmBookingSessionContext
  ) {}
}

export class AdminConfirmBookingCommandHandler
  implements CommandHandler<AdminConfirmBookingCommand, { success: boolean; alreadyConfirmed?: boolean }>
{
  private readonly bookingDomainService: BookingDomainService;

  constructor(
    private readonly bookingRepository: BookingRepository = firestoreBookingRepository,
    bookingDomainService?: BookingDomainService
  ) {
    this.bookingDomainService =
      bookingDomainService || new BookingDomainService(this.bookingRepository);
  }

  async execute(
    command: AdminConfirmBookingCommand
  ): Promise<{ success: boolean; alreadyConfirmed?: boolean }> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    let shouldSendEmail = false;
    let therapistId = '';
    let bookingData: Booking | null = null;
    let alreadyConfirmed = false;

    await adminDb.runTransaction(async (t) => {
      const booking = await this.bookingRepository.findById(command.bookingId, t);
      if (!booking) {
        throw new Error('Booking not found');
      }

      if (command.session.role === 'therapist') {
        const therapistDoc = await t.get(
          adminDb.collection('therapists').doc(booking.therapistId)
        );
        if (!therapistDoc.exists || therapistDoc.data()?.authId !== command.session.uid) {
          throw new Error('Unauthorized to modify this booking');
        }
      }

      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        throw new Error('Cannot confirm a cancelled or rejected booking');
      }

      therapistId = booking.therapistId;
      bookingData = booking;

      const slotId = `${booking.therapistId}_${booking.date}_${booking.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);

      if (booking.status === 'confirmed') {
        alreadyConfirmed = true;
        t.delete(slotRef);
        return;
      }

      BookingStateMachine.transition(booking, 'confirmed');
      booking.updatedAt = FieldValue.serverTimestamp();
      await this.bookingRepository.save(booking, t);

      t.delete(slotRef);

      const auditRef = adminDb
        .collection('bookings')
        .doc(command.bookingId)
        .collection('audit_logs')
        .doc();
      t.set(auditRef, {
        action: 'status_updated',
        status: 'confirmed',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Booking status changed to confirmed',
        userId: command.session.uid || 'system',
      });

      shouldSendEmail = true;
    });

    if (shouldSendEmail && bookingData) {
      try {
        await sendEmailAction({
          type: 'booking-confirmed',
          bookingId: command.bookingId,
          therapistId,
          bookingDetails: {
            name: (bookingData as Booking).name,
            email: (bookingData as Booking).email,
            phone: (bookingData as Booking).phone,
            date: (bookingData as Booking).date,
            time: (bookingData as Booking).time,
          },
        });
      } catch (err) {
        console.error('Failed to send confirmation email:', err);
      }
    }

    return { success: true, alreadyConfirmed };
  }
}
