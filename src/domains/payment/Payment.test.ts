import { describe, it, expect } from 'vitest';
import { Payment } from './Payment';

describe('Payment Domain', () => {
  describe('Payment Entity Transitions', () => {
    it('should start as pending by default', () => {
      const p = new Payment({
        id: 'pay_123',
        bookingId: 'bk_1',
        amount: 1500,
        currency: 'INR'
      });
      expect(p.status).toBe('pending');
    });

    it('should transition from pending to initiated', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'pending'
      });
      p.initiate();
      expect(p.status).toBe('initiated');
    });

    it('should transition from pending to success', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'pending'
      });
      const date = new Date();
      p.confirm(date, 'rzp_pay_id', 'rzp_sig', 'direct');
      expect(p.status).toBe('success');
      expect(p.razorpayPaymentId).toBe('rzp_pay_id');
      expect(p.razorpaySignature).toBe('rzp_sig');
      expect(p.source).toBe('direct');
      expect(p.verifiedAt).toBe(date);
    });

    it('should handle repeated confirmation idempotently (success -> success is a no-op)', () => {
      const initialDate = new Date(Date.now() - 10000);
      const p = new Payment({
        id: 'pay_123',
        status: 'pending'
      });
      p.confirm(initialDate, 'rzp_pay_id', undefined, 'webhook');
      expect(p.status).toBe('success');
      expect(p.razorpayPaymentId).toBe('rzp_pay_id');
      expect(p.source).toBe('webhook');
      expect(p.verifiedAt).toBe(initialDate);

      // Repeated confirmation with client verification signature
      const secondDate = new Date();
      expect(() => p.confirm(secondDate, 'rzp_pay_id', 'rzp_sig_456', 'direct')).not.toThrow();
      expect(p.status).toBe('success');
      expect(p.razorpaySignature).toBe('rzp_sig_456');
      expect(p.source).toBe('direct');
      expect(p.verifiedAt).toBe(initialDate); // Preserves original verification timestamp
    });

    it('should transition from failed to success', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'failed'
      });
      p.confirm(new Date(), 'rzp_pay_id', 'rzp_sig', 'direct');
      expect(p.status).toBe('success');
    });

    it('should transition from success to refunded', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'success'
      });
      const date = new Date();
      p.refund(date);
      expect(p.status).toBe('refunded');
      expect(p.refundedAt).toBe(date);
    });

    it('should throw error when attempting to confirm a refunded payment', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'refunded'
      });
      expect(() => p.confirm(new Date(), 'rzp_pay_id')).toThrow('Cannot transition payment');
    });

    it('should throw error on invalid transitions', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'success'
      });
      expect(() => p.initiate()).toThrow('Cannot transition payment');
    });
  });
});
