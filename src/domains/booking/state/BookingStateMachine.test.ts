import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Booking } from '../entities/Booking';
import { BookingStateMachine } from './BookingStateMachine';
import { DomainEvents, DomainEvent } from '../events/BookingEvents';
import { InvalidBookingTransitionError } from '../errors/InvalidBookingTransitionError';
import { BookingStatus } from '@/types';

describe('BookingStateMachine and Booking Entity', () => {
  beforeEach(() => {
    DomainEvents.clear();
    vi.clearAllMocks();
  });

  describe('Valid State Transitions', () => {
    it('should allow Draft → Locked transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'draft' });
      booking.lockSlot();
      expect(booking.status).toBe('slot_locked');
    });

    it('should allow Locked → Awaiting Payment transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'slot_locked' });
      booking.awaitPayment();
      expect(booking.status).toBe('awaiting_payment');
    });

    it('should allow Awaiting → Payment Started transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
      booking.initiatePayment();
      expect(booking.status).toBe('payment_initiated');
    });

    it('should allow Payment Started → Confirmed transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'payment_initiated' });
      booking.confirmPayment(new Date(), 'pay_123');
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(booking.razorpayPaymentId).toBe('pay_123');
    });

    it('should allow Confirmed → Completed transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
      booking.complete();
      expect(booking.status).toBe('completed');
    });

    it('should allow Confirmed → No Show transition with reason', () => {
      const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
      booking.markNoShow('Client did not join session call');
      expect(booking.status).toBe('no_show');
      expect(booking.noShowReason).toBe('Client did not join session call');
      expect(booking.cancellationOrRejectionReason).toBe('Client did not join session call');
      expect(booking.declineReason).toBe('Client did not join session call');
    });

    it('should allow Awaiting Payment → Expired transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
      booking.expire();
      expect(booking.status).toBe('expired');
    });

    it('should allow Expired → Awaiting Payment recovery transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'expired' });
      booking.awaitPayment();
      expect(booking.status).toBe('awaiting_payment');
    });

    it('should allow Cancelled → Awaiting Payment retry transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'cancelled' });
      booking.awaitPayment();
      expect(booking.status).toBe('awaiting_payment');
    });
  });

  describe('Payment Confirmation & Idempotency', () => {
    it('should support idempotent confirmPayment calls with identical payment ID', () => {
      const booking = new Booking({
        id: 'bk_1',
        status: 'confirmed',
        razorpayPaymentId: 'pay_123',
        paymentStatus: 'paid'
      });

      expect(() => booking.confirmPayment(new Date(), 'pay_123')).not.toThrow();
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(booking.razorpayPaymentId).toBe('pay_123');
    });

    it('should reject conflicting payment IDs on already confirmed bookings', () => {
      const booking = new Booking({
        id: 'bk_1',
        status: 'confirmed',
        razorpayPaymentId: 'pay_original',
        paymentStatus: 'paid'
      });

      expect(() => {
        booking.confirmPayment(new Date(), 'pay_conflicting');
      }).toThrow(/Booking already confirmed with payment pay_original/);
    });
  });

  describe('Reschedule History & Immutability', () => {
    it('should preserve original appointment date and time permanently across multiple reschedules', () => {
      const booking = new Booking({
        id: 'bk_1',
        status: 'confirmed',
        date: '2026-09-01',
        time: '10:00'
      });

      // First reschedule
      booking.reschedule('2026-09-02', '11:00', new Date('2026-08-30T10:00:00Z'), undefined, 'Client requested morning slot');
      expect(booking.originalDate).toBe('2026-09-01');
      expect(booking.originalTime).toBe('10:00');
      expect(booking.date).toBe('2026-09-02');
      expect(booking.time).toBe('11:00');
      expect(booking.rescheduleHistory).toHaveLength(1);
      expect(booking.rescheduleHistory?.[0].previousDate).toBe('2026-09-01');
      expect(booking.rescheduleHistory?.[0].newDate).toBe('2026-09-02');
      expect(booking.rescheduleHistory?.[0].reason).toBe('Client requested morning slot');

      // Second reschedule (must NOT overwrite originalDate)
      booking.reschedule('2026-09-05', '14:00', new Date('2026-08-31T12:00:00Z'), undefined, 'Therapist emergency conflict');
      expect(booking.originalDate).toBe('2026-09-01');
      expect(booking.originalTime).toBe('10:00');
      expect(booking.date).toBe('2026-09-05');
      expect(booking.time).toBe('14:00');
      expect(booking.rescheduleHistory).toHaveLength(2);
      expect(booking.rescheduleHistory?.[1].previousDate).toBe('2026-09-02');
      expect(booking.rescheduleHistory?.[1].newDate).toBe('2026-09-05');
    });

    it('should prevent rescheduling cancelled, rejected, or completed bookings', () => {
      const cancelledBooking = new Booking({ id: 'bk_1', status: 'cancelled', date: '2026-09-01', time: '10:00' });
      expect(() => cancelledBooking.reschedule('2026-09-02', '11:00')).toThrow(/Cannot reschedule a cancelled booking/);

      const completedBooking = new Booking({ id: 'bk_2', status: 'completed', date: '2026-09-01', time: '10:00' });
      expect(() => completedBooking.reschedule('2026-09-02', '11:00')).toThrow(/Cannot reschedule a completed booking/);
    });
  });

  describe('Terminal State Violations', () => {
    it('should prevent any transition out of Completed', () => {
      const booking = new Booking({ id: 'bk_1', status: 'completed' });
      expect(() => BookingStateMachine.transition(booking, 'draft')).toThrow(InvalidBookingTransitionError);
      expect(() => BookingStateMachine.transition(booking, 'confirmed')).toThrow(InvalidBookingTransitionError);
      expect(() => BookingStateMachine.transition(booking, 'awaiting_payment')).toThrow(InvalidBookingTransitionError);
    });

    it('should prevent any transition out of Rejected', () => {
      const booking = new Booking({ id: 'bk_1', status: 'rejected' });
      expect(() => BookingStateMachine.transition(booking, 'confirmed')).toThrow(InvalidBookingTransitionError);
      expect(() => BookingStateMachine.transition(booking, 'slot_locked')).toThrow(InvalidBookingTransitionError);
    });

    it('should prevent any transition out of No Show', () => {
      const booking = new Booking({ id: 'bk_1', status: 'no_show' });
      expect(() => BookingStateMachine.transition(booking, 'confirmed')).toThrow(InvalidBookingTransitionError);
      expect(() => BookingStateMachine.transition(booking, 'completed')).toThrow(InvalidBookingTransitionError);
    });
  });

  describe('State Normalization', () => {
    it('should normalize uppercase input states', () => {
      const booking = new Booking({ id: 'bk_1', status: 'DRAFT' as unknown as BookingStatus });
      booking.lockSlot(); // 'slot_locked'
      expect(booking.status).toBe('slot_locked');
    });

    it('should normalize legacy aliases such as locked and payment_started', () => {
      expect(BookingStateMachine.normalizeStatus('locked')).toBe('slot_locked');
      expect(BookingStateMachine.normalizeStatus('payment_started')).toBe('payment_initiated');
    });
  });

  describe('Domain Events & Error Isolation', () => {
    it('should publish a domain event upon successful transition', async () => {
      const mockListener = vi.fn();
      DomainEvents.subscribe('BookingSlotLocked', mockListener);

      const booking = new Booking({ id: 'bk_1', status: 'draft' });
      booking.lockSlot();

      // Wait a tick for async dispatch to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockListener).toHaveBeenCalledTimes(1);
      const event: DomainEvent = mockListener.mock.calls[0][0];
      expect(event.name).toBe('BookingSlotLocked');
      expect(event.data.bookingId).toBe('bk_1');
      expect(event.data.previousStatus).toBe('draft');
      expect(event.data.targetStatus).toBe('slot_locked');
    });

    it('should not allow failing domain event listeners to crash state transition', async () => {
      DomainEvents.subscribe('BookingSlotLocked', () => {
        throw new Error('Listener internal failure');
      });

      const booking = new Booking({ id: 'bk_2', status: 'draft' });
      expect(() => booking.lockSlot()).not.toThrow();
      expect(booking.status).toBe('slot_locked');
    });
  });
});

