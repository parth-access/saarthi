import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Booking } from '../entities/Booking';
import { BookingDomainService } from './BookingDomainService';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingEvents } from '../events/BookingEvents';
import { OutboxService } from '@/shared/events/outbox';

/**
 * Every `BookingDomainService` mutator records a durable outbox event next to the
 * state change — that is part of its contract, not an incidental detail.
 *
 * These are unit tests with a mocked repository and no Firestore, so the outbox
 * WRITER is mocked here; left real, `OutboxService.recordEvent` reaches the
 * uninitialised `adminDb` and every mutator rejects with
 * "[OutboxService] Database not initialized for durable outbox recording" — a
 * harness artefact rather than the behaviour under test. `generateDeterministicEventId`
 * is deliberately kept REAL (via `importOriginal`) so the event ids asserted below
 * are the exact ids production writes, which is what makes replay idempotent.
 */
vi.mock('@/shared/events/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/events/outbox')>();
  return {
    ...actual,
    OutboxService: {
      recordEvent: vi.fn().mockResolvedValue(undefined),
      recordEventInTransaction: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('BookingDomainService', () => {
  let mockRepository: BookingRepository;
  let service: BookingDomainService;

  beforeEach(() => {
    vi.clearAllMocks();
    BookingEvents.clear();
    mockRepository = {
      generateId: vi.fn(),
      create: vi.fn(),
      lockSlot: vi.fn(),
      releaseSlot: vi.fn(),
      findById: vi.fn(),
      findByToken: vi.fn(),
      findStaleBookings: vi.fn(),
      findExpiredLocks: vi.fn(),
      save: vi.fn(),
      findAll: vi.fn(),
      findByTherapistId: vi.fn(),
      findActiveBookingsByTherapistAndDate: vi.fn(),
      findByOrderId: vi.fn(),
      findBookingsNeedingCalendarRetry: vi.fn(),
      findByClient: vi.fn(),
    };
    service = new BookingDomainService(mockRepository);
  });

  it('should call create on the repository', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'draft' });
    await service.createBooking(booking);
    expect(mockRepository.create).toHaveBeenCalledWith(booking, undefined);
  });

  it('should transition to awaiting_payment and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'slot_locked' });
    await service.awaitPayment(booking);
    expect(booking.status).toBe('awaiting_payment');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_awaiting_payment',
        name: 'BookingAwaitingPayment',
        aggregateType: 'booking',
        aggregateId: 'bk_1',
      })
    );
  });

  it('should transition to payment_initiated and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
    await service.initiatePayment(booking);
    expect(booking.status).toBe('payment_initiated');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_payment_initiated',
        name: 'BookingPaymentInitiated',
      })
    );
  });

  it('should transition to confirmed, update paymentStatus/razorpayPaymentId and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'payment_initiated' });
    const verifiedAt = new Date();
    await service.confirmPayment(booking, verifiedAt, 'pay_123');
    expect(booking.status).toBe('confirmed');
    expect(booking.paymentStatus).toBe('paid');
    expect(booking.razorpayPaymentId).toBe('pay_123');
    expect(booking.paymentVerifiedAt).toBe(verifiedAt);
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_confirmed',
        name: 'BookingConfirmed',
      })
    );
  });

  it('should transition to completed and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    await service.completeBooking(booking);
    expect(booking.status).toBe('completed');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_completed',
        name: 'BookingCompleted',
      })
    );
  });

  it('should transition to cancelled and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    await service.cancelBooking(booking, 'Customer requested cancellation');
    expect(booking.status).toBe('cancelled');
    expect(booking.declineReason).toBe('Customer requested cancellation');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_cancelled',
        name: 'BookingCancelled',
      })
    );
  });

  it('should revert in-memory status if save fails on cancelBooking', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    mockRepository.save = vi.fn().mockRejectedValue(new Error('Firestore write failed'));
    await expect(service.cancelBooking(booking, 'Customer requested cancellation')).rejects.toThrow('Firestore write failed');
    expect(booking.status).toBe('confirmed');
    // A failed aggregate write must not leave an event claiming the cancellation happened.
    expect(OutboxService.recordEvent).not.toHaveBeenCalled();
  });

  it('should transition to no_show and assign noShowReason and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    await service.markNoShow(booking, 'Client did not attend session');
    expect(booking.status).toBe('no_show');
    expect(booking.noShowReason).toBe('Client did not attend session');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_no_show',
        name: 'BookingNoShow',
      })
    );
  });

  it('should transition to rejected (decline) and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'pending' });
    const declinedAt = new Date();
    await service.declineBooking(booking, 'Therapist unavailable', 'admin', 'Sorry about that', declinedAt);
    expect(booking.status).toBe('rejected');
    expect(booking.declineReason).toBe('Therapist unavailable');
    expect(booking.declinedBy).toBe('admin');
    expect(booking.declineCustomNote).toBe('Sorry about that');
    expect(booking.declinedAt).toBe(declinedAt);
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_rejected',
        name: 'BookingRejected',
      })
    );
  });

  it('should transition to expired and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
    await service.expireBooking(booking);
    expect(booking.status).toBe('expired');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_expired',
        name: 'BookingExpired',
      })
    );
  });

  it('should reschedule, update fields and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed', date: '2026-07-20', time: '10:00' });
    const rescheduledAt = new Date();
    await service.rescheduleBooking(booking, '2026-07-21', '11:00', rescheduledAt, '2026-07-21T11:00:00.000Z');
    expect(booking.date).toBe('2026-07-21');
    expect(booking.time).toBe('11:00');
    expect(booking.originalDate).toBe('2026-07-20');
    expect(booking.originalTime).toBe('10:00');
    expect(booking.utcDateTime).toBe('2026-07-21T11:00:00.000Z');
    expect(booking.rescheduledAt).toBe(rescheduledAt);
    // The self-service path never supplies a reason; the history entry must omit
    // the key rather than store `reason: undefined` (Firestore rejects that and
    // aborted the whole `/api/bookings/reschedule-self` transaction).
    expect(booking.rescheduleHistory).toHaveLength(1);
    expect('reason' in booking.rescheduleHistory![0]).toBe(false);
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
    // The target slot is part of the event id, so re-issuing the SAME reschedule is
    // idempotent while a genuinely different reschedule gets its own event.
    expect(OutboxService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'outbox_booking_bk_1_rescheduled_2026-07-21_11-00',
        name: 'BookingRescheduled',
      })
    );
  });
});
