import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Booking } from '../entities/Booking';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';
import { SlotReservationService, SlotSwapPlan } from '../services/SlotReservationService';
import { OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { istToUtcIsoString } from '@/shared/utils/dateTime';
import { slotStartEpochMs, slotTemporalReason } from '@/shared/scheduling/slots';
import { BOOKING_WINDOW_DAYS } from '@/shared/constants';
import { runPlannedTransaction, TxReader, TxWriter } from '@/shared/firestore/transactionPhases';

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

/** Everything the write phase needs, resolved by the READ phase. */
interface ReschedulePlan {
  booking: Booking;
  oldDate: string;
  oldTime: string;
  isConfirmed: boolean;
  /** Fresh 10-minute hold for non-confirmed bookings; null when already paid. */
  freshHoldDate: Date | null;
  swap: SlotSwapPlan;
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

    const bookingData = await runPlannedTransaction<ReschedulePlan, Booking>(adminDb, {
      read: (reader) => this.readPlan(reader, command),
      write: (writer, plan) => this.applyPlan(writer, plan, command, utcDateTime || undefined),
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

  /**
   * READ PHASE — authorization, status guards, window validation, availability
   * check and the slot-swap lookups. Every `get` in this command lives here, so
   * the write phase cannot violate Firestore's read-before-write rule.
   */
  private async readPlan(reader: TxReader, command: RescheduleBookingCommand): Promise<ReschedulePlan> {
    const booking = await this.bookingRepository.findById(command.bookingId, reader);
    if (!booking) {
      throw new Error('Booking not found');
    }

    // Defense-in-depth Access Control Guard
    if (command.session.role === 'admin') {
      // Admin is authorized to reschedule any booking
    } else if (command.session.role === 'therapist') {
      const therapistDoc = await reader.get(adminDb.collection('therapists').doc(booking.therapistId));
      if (!therapistDoc.exists || therapistDoc.data()?.authId !== command.session.uid) {
        throw new Error('Unauthorized to modify this booking');
      }
    } else if (command.session.isTokenFlow) {
      if (booking.invalidToken) {
        throw new Error('Unauthorized: Reschedule token has been invalidated.');
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
        throw new Error('Unauthorized: Client user ownership mismatch');
      }
    } else {
      throw new Error('Unauthorized: No valid session context or credentials presented to reschedule booking.');
    }

    // Block rescheduling of completed or no_show bookings
    if (booking.status === 'completed' || booking.status === 'no_show') {
      throw new Error('Cannot reschedule a completed or no-show session.');
    }

    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new Error('Cannot reschedule a cancelled or rejected booking.');
    }

    // 1. Validate booking window / past-time. Both rules come from the canonical
    // IST helpers so the grid the client was shown by `/api/availability` and the
    // validation it hits here cannot disagree — this file used to re-derive them
    // from a `+05:30` string literal and a hardcoded 14-day constant.
    const temporalReason = slotTemporalReason(command.newDate, command.newTime);

    if (temporalReason === 'past') {
      // `slotStartEpochMs` returns null for an unparseable or impossible day
      // (2026-02-30), which reports as 'past'; separate the two for the caller.
      if (slotStartEpochMs(command.newDate, command.newTime) === null) {
        throw new Error('Invalid reschedule date/time format.');
      }
      throw new Error('Cannot reschedule to a past date/time.');
    }

    if (temporalReason === 'beyond_window') {
      throw new Error(`Cannot reschedule further than ${BOOKING_WINDOW_DAYS} days in advance.`);
    }

    // 2. Validate slot against therapist's actual availability rules and overrides
    const isAvailable = await SlotReservationService.isSlotInTherapistAvailability(
      booking.therapistId,
      command.newDate,
      command.newTime,
      reader
    );
    if (!isAvailable) {
      throw new Error("The selected slot is outside the therapist's scheduled hours or overrides.");
    }

    const oldDate = booking.date;
    const oldTime = booking.time;
    const isConfirmed = booking.status === 'confirmed' || booking.paymentStatus === 'paid';
    const freshHoldDate = isConfirmed ? null : new Date(Date.now() + 10 * 60 * 1000);

    // 3. Resolve the pin swap. Reads the target slot AND the booking's current pin.
    //    The old single-call helper read the target, deleted a stale hold, then read
    //    the old pin — a read-after-write whenever the target carried an expired lock.
    const swap = await SlotReservationService.readSlotSwapPlan(
      reader,
      booking.therapistId,
      oldDate,
      oldTime,
      command.newDate,
      command.newTime,
      command.bookingId
    );

    return { booking, oldDate, oldTime, isConfirmed, freshHoldDate, swap };
  }

  /**
   * WRITE PHASE — pure writes. Note the reschedule timestamp: it must be a
   * CONCRETE `Timestamp`, never `FieldValue.serverTimestamp()`, because it is
   * appended to the `rescheduleHistory` array and Firestore rejects sentinels
   * inside arrays. Passing a sentinel here is the production
   * `FieldValue.serverTimestamp() cannot be used inside an array (found in field
   * "rescheduleHistory.0.rescheduledAt")` failure that aborted the whole
   * reschedule transaction. `ArraySafeTimestamp` now rejects it at compile time.
   */
  private async applyPlan(
    writer: TxWriter,
    plan: ReschedulePlan,
    command: RescheduleBookingCommand,
    utcDateTime?: string
  ): Promise<Booking> {
    const { booking, oldDate, oldTime, isConfirmed, freshHoldDate, swap } = plan;

    SlotReservationService.applySlotSwap(writer, swap, {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      userId: booking.userId,
      email: booking.email,
      holdExpiresAt: freshHoldDate,
      lockId: booking.bookingToken,
    });

    // Set the new hold limit before the domain save so a single write persists it.
    if (!isConfirmed && freshHoldDate) {
      booking.holdExpiresAt = Timestamp.fromDate(freshHoldDate);
    }

    await this.bookingDomainService.rescheduleBooking(
      booking,
      command.newDate,
      command.newTime,
      Timestamp.now(),
      utcDateTime,
      writer
    );

    const auditRef = adminDb.collection('bookings').doc(command.bookingId).collection('audit_logs').doc();
    writer.set(auditRef, {
      action: 'rescheduled',
      timestamp: FieldValue.serverTimestamp(),
      details: command.session.isTokenFlow
        ? `Booking rescheduled via manage link from ${oldDate} ${oldTime} to ${command.newDate} ${command.newTime}`
        : `Booking rescheduled from ${oldDate} ${oldTime} to ${command.newDate} ${command.newTime}`,
      userId: command.session.uid || 'system-token-flow',
    });

    return booking;
  }
}
