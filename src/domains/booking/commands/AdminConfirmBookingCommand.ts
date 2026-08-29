import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { BookingStateMachine } from '../state/BookingStateMachine';
import { Booking } from '../entities/Booking';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { OutboxService, OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { SlotReservationService } from '../services/SlotReservationService';

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

      const slotId = SlotReservationService.getSlotId(booking.therapistId, booking.date, booking.time);
      const slotRef = adminDb.collection('locked_slots').doc(slotId);

      if (booking.status === 'confirmed') {
        alreadyConfirmed = true;
        t.delete(slotRef);
        return;
      }

      const previousStatus = booking.status;
      BookingStateMachine.transition(booking, 'confirmed', { skipEventBus: true });
      booking.updatedAt = FieldValue.serverTimestamp();
      await this.bookingRepository.save(booking, t);

      t.delete(slotRef);

      const eventId = generateDeterministicEventId('booking', command.bookingId, 'confirmed');
      OutboxService.recordEventInTransaction(t, {
        id: eventId,
        name: 'BookingConfirmed',
        aggregateType: 'booking',
        aggregateId: command.bookingId,
        payload: {
          bookingId: command.bookingId,
          booking: { ...booking },
          previousStatus,
          targetStatus: 'confirmed',
          metadata: {
            adminUid: command.session.uid,
            adminRole: command.session.role,
          }
        }
      });

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

    if (shouldSendEmail) {
      const eventId = generateDeterministicEventId('booking', command.bookingId, 'confirmed');
      await OutboxProcessor.processEvent(eventId).catch((err) => {
        console.error('[AdminConfirmBookingCommandHandler] Async outbox processing error:', err);
      });
    }

    return { success: true, alreadyConfirmed };
  }
}

