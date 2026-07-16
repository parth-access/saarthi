import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Booking } from './entities/Booking';
import { BookingStateMachine, DomainEvents, DomainEvent } from './state/BookingStateMachine';
import { InvalidStateTransitionError } from '@/shared/errors';
import { BookingStatus } from '@/types';

describe('BookingStateMachine and Booking Entity', () => {
  beforeEach(() => {
    DomainEvents.clear();
    vi.clearAllMocks();
  });

  describe('Valid Transitions', () => {
    it('✓ should allow Draft → Locked transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'draft' });
      booking.lockSlot();
      expect(booking.status).toBe('slot_locked');
    });

    it('✓ should allow Locked → Awaiting Payment transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'slot_locked' });
      booking.awaitPayment();
      expect(booking.status).toBe('awaiting_payment');
    });

    it('✓ should allow Awaiting → Payment Started transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
      booking.initiatePayment();
      expect(booking.status).toBe('payment_initiated');
    });

    it('✓ should allow Payment Started → Confirmed transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'payment_initiated' });
      booking.confirmPayment(new Date(), 'pay_123');
      expect(booking.status).toBe('confirmed');
      expect(booking.paymentStatus).toBe('paid');
      expect(booking.razorpayPaymentId).toBe('pay_123');
    });

    it('✓ should allow Confirmed → Completed transition', () => {
      const booking = new Booking({ id: 'bk_1', status: 'confirmed' });
      booking.complete();
      expect(booking.status).toBe('completed');
    });
  });

  describe('Invalid Transitions', () => {
    it('should throw InvalidStateTransitionError for Completed → Draft', () => {
      const booking = new Booking({ id: 'bk_1', status: 'completed' });
      expect(() => {
        BookingStateMachine.transition(booking, 'draft');
      }).toThrow(InvalidStateTransitionError);
    });

    it('should throw InvalidStateTransitionError for Cancelled → Confirmed', () => {
      const booking = new Booking({ id: 'bk_1', status: 'cancelled' });
      expect(() => {
        BookingStateMachine.transition(booking, 'confirmed');
      }).toThrow(InvalidStateTransitionError);
    });

    it('should throw InvalidStateTransitionError for Expired → Payment Started', () => {
      const booking = new Booking({ id: 'bk_1', status: 'expired' });
      expect(() => {
        BookingStateMachine.transition(booking, 'payment_initiated');
      }).toThrow(InvalidStateTransitionError);
    });
  });

  describe('State Normalization', () => {
    it('should normalize uppercase input states', () => {
      const booking = new Booking({ id: 'bk_1', status: 'DRAFT' as unknown as BookingStatus });
      booking.lockSlot(); // 'slot_locked'
      expect(booking.status).toBe('slot_locked');
    });

    it('should normalize input with spaces', () => {
      const booking = new Booking({ id: 'bk_1', status: 'awaiting_payment' });
      BookingStateMachine.transition(booking, 'Payment Started' as unknown as BookingStatus);
      expect(booking.status).toBe('Payment Started'); // status retains original casing but validates correctly
    });
  });

  describe('Domain Events', () => {
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
  });
});
