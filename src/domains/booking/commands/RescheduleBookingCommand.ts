import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Booking } from '../entities/Booking';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { SlotReservationService } from '../services/SlotReservationService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';

export interface RescheduleBookingSessionContext {
  uid?: string;
  role?: string;
  isTokenFlow?: boolean;
}

export class RescheduleBookingCommand {
  constructor(
    public readonly bookingId: string,
    public readonly newDate: string,
    public readonly newTime: string,
    public readonly session: RescheduleBookingSessionContext
  ) {}
}

export class RescheduleBookingCommandHandler {
  private readonly bookingDomainService: BookingDomainService;

  constructor(
    private readonly bookingRepository: BookingRepository = firestoreBookingRepository,
    bookingDomainService?: BookingDomainService
  ) {
    this.bookingDomainService = bookingDomainService || new BookingDomainService(this.bookingRepository);
  }

  async execute(command: RescheduleBookingCommand): Promise<Booking> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    let utcDateTime = '';
    try {
      const localString = `${command.newDate}T${command.newTime}`;
      const dt = new Date(localString);
      utcDateTime = isNaN(dt.getTime()) ? '' : dt.toISOString();
    } catch {}

    const { bookingData } = await adminDb.runTransaction(async (t) => {
      const booking = await this.bookingRepository.findById(command.bookingId, t);
      if (!booking) {
        throw new Error("Booking not found");
      }

      if (command.session.role === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(booking.therapistId));
        if (!therapistDoc.exists || therapistDoc.data()?.authId !== command.session.uid) {
          throw new Error("Unauthorized to modify this booking");
        }
      }

      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        throw new Error("Cannot reschedule a cancelled or rejected booking.");
      }

      const oldDate = booking.date;
      const oldTime = booking.time;

      await SlotReservationService.swapSlotsInTransaction(
        t,
        booking.therapistId,
        oldDate,
        oldTime,
        command.newDate,
        command.newTime,
        command.bookingId
      );

      await this.bookingDomainService.rescheduleBooking(
        booking,
        command.newDate,
        command.newTime,
        FieldValue.serverTimestamp(),
        utcDateTime || undefined,
        t
      );

      const auditRef = adminDb.collection('bookings').doc(command.bookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'rescheduled',
        timestamp: FieldValue.serverTimestamp(),
        details: command.session.isTokenFlow 
          ? `Booking rescheduled via manage link from ${oldDate} ${oldTime} to ${command.newDate} ${command.newTime}`
          : `Booking rescheduled from ${oldDate} ${oldTime} to ${command.newDate} ${command.newTime}`,
        userId: command.session.uid || 'system-token-flow'
      });

      return { bookingData: booking };
    });

    const outboxEventId = generateDeterministicEventId(
      'booking',
      command.bookingId,
      'rescheduled',
      `${command.newDate}_${command.newTime}`
    );
    OutboxProcessor.processEvent(outboxEventId).catch((err) => {
      console.error('[RescheduleBookingCommandHandler] Async outbox processing error:', err);
    });

    return bookingData;
  }
}

