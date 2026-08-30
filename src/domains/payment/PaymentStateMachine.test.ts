import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStateMachine } from './PaymentStateMachine';
import { InvalidPaymentTransitionError } from './errors/InvalidPaymentTransitionError';
import { EventBus } from '@/shared/events/EventBus';

describe('PaymentStateMachine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Transitions', () => {
    it('should allow pending → initiated transition', () => {
      const payment = { id: 'pay_1', status: 'pending' as const };
      expect(PaymentStateMachine.canTransition('pending', 'initiated')).toBe(true);
      PaymentStateMachine.transition(payment, 'initiated');
      expect(payment.status).toBe('initiated');
    });

    it('should allow pending → success transition', () => {
      const payment = { id: 'pay_1', status: 'pending' as const };
      expect(PaymentStateMachine.canTransition('pending', 'success')).toBe(true);
      PaymentStateMachine.transition(payment, 'success');
      expect(payment.status).toBe('success');
    });

    it('should allow initiated → success transition', () => {
      const payment = { id: 'pay_1', status: 'initiated' as const };
      expect(PaymentStateMachine.canTransition('initiated', 'success')).toBe(true);
      PaymentStateMachine.transition(payment, 'success');
      expect(payment.status).toBe('success');
    });

    it('should allow initiated → failed transition', () => {
      const payment = { id: 'pay_1', status: 'initiated' as const };
      expect(PaymentStateMachine.canTransition('initiated', 'failed')).toBe(true);
      PaymentStateMachine.transition(payment, 'failed');
      expect(payment.status).toBe('failed');
    });

    it('should allow failed → initiated retry transition', () => {
      const payment = { id: 'pay_1', status: 'failed' as const };
      expect(PaymentStateMachine.canTransition('failed', 'initiated')).toBe(true);
      PaymentStateMachine.transition(payment, 'initiated');
      expect(payment.status).toBe('initiated');
    });

    it('should allow success → refunded transition', () => {
      const payment = { id: 'pay_1', status: 'success' as const };
      expect(PaymentStateMachine.canTransition('success', 'refunded')).toBe(true);
      PaymentStateMachine.transition(payment, 'refunded');
      expect(payment.status).toBe('refunded');
    });
  });

  describe('Terminal and Prohibited Transitions', () => {
    it('should strictly prohibit transitions out of refunded', () => {
      const payment = { id: 'pay_1', status: 'refunded' as const };
      expect(PaymentStateMachine.canTransition('refunded', 'pending')).toBe(false);
      expect(PaymentStateMachine.canTransition('refunded', 'success')).toBe(false);
      expect(() => PaymentStateMachine.transition(payment, 'success')).toThrow(InvalidPaymentTransitionError);
    });

    it('should prohibit success → pending or success → failed', () => {
      const payment = { id: 'pay_1', status: 'success' as const };
      expect(PaymentStateMachine.canTransition('success', 'pending')).toBe(false);
      expect(PaymentStateMachine.canTransition('success', 'failed')).toBe(false);
      expect(() => PaymentStateMachine.transition(payment, 'pending')).toThrow(InvalidPaymentTransitionError);
    });
  });

  describe('EventBus Integration and Safety', () => {
    it('should publish PaymentSuccess event when transitioning to success', async () => {
      const publishSpy = vi.spyOn(EventBus, 'publish').mockResolvedValue({ success: true, errors: [] });
      const payment = { id: 'pay_1', status: 'initiated' as const };

      PaymentStateMachine.transition(payment, 'success');

      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'PaymentSuccess',
          payload: expect.objectContaining({
            paymentId: 'pay_1',
            targetStatus: 'success'
          })
        })
      );
    });

    it('should not throw if EventBus fails during transition', async () => {
      vi.spyOn(EventBus, 'publish').mockRejectedValue(new Error('EventBus connection timeout'));
      const payment = { id: 'pay_2', status: 'initiated' as const };

      expect(() => PaymentStateMachine.transition(payment, 'failed')).not.toThrow();
      expect(payment.status).toBe('failed');
    });
  });
});
