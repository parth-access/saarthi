import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Booking } from '../entities/Booking';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { SlotReservationService } from '../services/SlotReservationService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { istToUtcIsoString } from '@/shared/utils/dateTime';

export interface RescheduleBookingSessionContext {
  uid?: string;
  /**
   * Verified session email (from verifySession). Used to authorize bookings
   * that were created unauthenticated and carry only an `email` (no `userId`),
   * mirroring the userId-OR-email ownership model used by join-session.
   */
  email?: string;
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

    const utcDateTime = istToUtcIsoString(command.newDate, command.newTime);

    const { bookingData } = await adminDb.runTransaction(async (t) => {
      const booking = await this.bookingRepository.findById(command.bookingId, t);
      if (!booking) {
        throw new Error("Booking not found");
      }

      // Defense-in-depth Access Control Guard
      if (command.session.role === 'admin') {
        // Admin is authorized to reschedule any booking
      } else if (command.session.role === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(booking.therapistId));
        if (!therapistDoc.exists || therapistDoc.data()?.authId !== command.session.uid) {
          throw new Error("Unauthorized to modify this booking");
        }
      } else if (command.session.isTokenFlow) {
        if (booking.invalidToken) {
          throw new Error("Unauthorized: Reschedule token has been invalidated.");
        }
      } else if (command.session.uid || command.session.email) {
        // Authenticated client user must own the booking (by uid or verified email).
        const ownsByUid =
          !!command.session.uid &&
          (booking.userId === command.session.uid || booking.email === command.session.uid);
        const ownsByEmail =
          !!command.session.email &&
          !!booking.email &&
          booking.email.toLowerCase() === command.session.email.toLowerCase();
        if (!ownsByUid && !ownsByEmail) {
          throw new Error("Unauthorized: Client user ownership mismatch");
        }
      } else {
        throw new Error("Unauthorized: No valid session context or credentials presented to reschedule booking.");
      }

      // Block rescheduling of completed or no_show bookings
      if (booking.status === 'completed' || booking.status === 'no_show') {
        throw new Error("Cannot reschedule a completed or no-show session.");
      }

      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        throw new Error("Cannot reschedule a cancelled or rejected booking.");
      }

      // 1. Validate booking window / past-time
      const slotDate = new Date(`${command.newDate}T${command.newTime}:00+05:30`);
      if (isNaN(slotDate.getTime())) {
        throw new Error("Invalid reschedule date/time format.");
      }

      if (slotDate.getTime() < Date.now()) {
        throw new Error("Cannot reschedule to a past date/time.");
      }

      const maxBookingDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
      if (slotDate.getTime() > maxBookingDate.getTime()) {
        throw new Error("Cannot reschedule further than 14 days in advance.");
      }

      // 2. Validate slot against therapist's actual availability rules and overrides
      const isAvailable = await SlotReservationService.isSlotInTherapistAvailability(
        booking.therapistId,
        command.newDate,
        command.newTime,
        t
      );
      if (!isAvailable) {
        throw new Error("The selected slot is outside the therapist's scheduled hours or overrides.");
      }

      const oldDate = booking.date;
      const oldTime = booking.time;

      const isConfirmed = booking.status === 'confirmed' || booking.paymentStatus === 'paid';
      const freshHoldDate = isConfirmed ? null : new Date(Date.now() + 10 * 60 * 1000);

      // 3. Atomically swap pins
      await SlotReservationService.swapSlotsInTransaction(
        t,
        booking.therapistId,
        oldDate,
        oldTime,
        command.newDate,
        command.newTime,
        command.bookingId,
        {
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          userId: booking.userId,
          email: booking.email,
          holdExpiresAt: freshHoldDate,
          lockId: booking.bookingToken
        }
      );

      // 4. Update booking domain model state
      await this.bookingDomainService.rescheduleBooking(
        booking,
        command.newDate,
        command.newTime,
        FieldValue.serverTimestamp(),
        utcDateTime || undefined,
        t
      );

      // Set new hold limit on the non-confirmed booking record for consistency with slot pin
      if (!isConfirmed && freshHoldDate) {
        booking.holdExpiresAt = freshHoldDate;
        await this.bookingRepository.save(booking, t);
      }

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
