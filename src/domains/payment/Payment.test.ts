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

    it('should throw error on invalid transitions', () => {
      const p = new Payment({
        id: 'pay_123',
        status: 'success'
      });
      expect(() => p.initiate()).toThrow('Cannot transition payment');
    });
  });
});
