import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Booking } from '../entities/Booking';
import { BookingDomainService } from './BookingDomainService';
import { BookingRepository } from '../repository/BookingRepository';
import { BookingEvents } from '../events/BookingEvents';

describe('BookingDomainService', () => {
  let mockRepository: BookingRepository;
  let service: BookingDomainService;

  beforeEach(() => {
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
  });

  it('should transition to payment_initiated and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
    await service.initiatePayment(booking);
    expect(booking.status).toBe('payment_initiated');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
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
  });

  it('should transition to completed and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    await service.completeBooking(booking);
    expect(booking.status).toBe('completed');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
  });

  it('should transition to cancelled and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    await service.cancelBooking(booking, 'Customer requested cancellation');
    expect(booking.status).toBe('cancelled');
    expect(booking.declineReason).toBe('Customer requested cancellation');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
  });

  it('should revert in-memory status if save fails on cancelBooking', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    mockRepository.save = vi.fn().mockRejectedValue(new Error('Firestore write failed'));
    await expect(service.cancelBooking(booking, 'Customer requested cancellation')).rejects.toThrow('Firestore write failed');
    expect(booking.status).toBe('confirmed');
  });

  it('should transition to no_show and assign noShowReason and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
    await service.markNoShow(booking, 'Client did not attend session');
    expect(booking.status).toBe('no_show');
    expect(booking.noShowReason).toBe('Client did not attend session');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
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
  });

  it('should transition to expired and save', async () => {
    const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
    await service.expireBooking(booking);
    expect(booking.status).toBe('expired');
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
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
    expect(mockRepository.save).toHaveBeenCalledWith(booking, undefined);
  });
});
