import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RazorpayGateway } from './RazorpayGateway';
import { config } from '@/shared/config';
import crypto from 'crypto';

// Mock Razorpay SDK
const mockPaymentsFetch = vi.fn();
const mockPaymentsRefund = vi.fn();

vi.mock('razorpay', () => {
  return {
    default: class MockRazorpay {
      orders = {
        create: vi.fn().mockImplementation((params: Record<string, unknown> & { amount: number; currency: string }) => {
          if (params.amount < 0) return Promise.reject(new Error('Invalid amount'));
          return Promise.resolve({ id: 'order_real_123', amount: params.amount, currency: params.currency });
        })
      };
      payments = {
        fetch: (...args: unknown[]) => mockPaymentsFetch(...args),
        refund: (...args: unknown[]) => mockPaymentsRefund(...args),
      };
    }
  };
});

describe('RazorpayGateway', () => {
  let gateway: RazorpayGateway;
  
  beforeEach(() => {
    gateway = new RazorpayGateway();
    vi.resetModules();
    mockPaymentsFetch.mockReset();
    mockPaymentsRefund.mockReset();
  });

  describe('Order Creation', () => {
    it('A. Missing Razorpay credentials -> payment creation fails', async () => {
      const originalId = config.razorpay.keyId;
      config.razorpay.keyId = ''; // Clear key
      
      await expect(gateway.createOrder({ bookingId: 'bk_1', therapistId: 'th_1', amount: 1500, currency: 'INR' }))
        .rejects.toThrow('Razorpay keys are not configured properly. Payment cannot proceed.');
        
      config.razorpay.keyId = originalId; // Restore
    });

    it('B. Razorpay authentication failure -> payment creation fails', async () => {
       const originalSecret = config.razorpay.keySecret;
       config.razorpay.keySecret = 'placeholder';
       
       await expect(gateway.createOrder({ bookingId: 'bk_1', therapistId: 'th_1', amount: 1500, currency: 'INR' }))
        .rejects.toThrow('Razorpay keys are not configured properly. Payment cannot proceed.');
        
       config.razorpay.keySecret = originalSecret;
    });

    it('C. Razorpay API failure -> payment creation fails', async () => {
       const originalId = config.razorpay.keyId;
       const originalSecret = config.razorpay.keySecret;
       
       config.razorpay.keyId = 'real_id';
       config.razorpay.keySecret = 'real_secret';
       
       await expect(gateway.createOrder({ bookingId: 'bk_1', therapistId: 'th_1', amount: -1500, currency: 'INR' }))
        .rejects.toThrow('Invalid amount');
        
       config.razorpay.keyId = originalId;
       config.razorpay.keySecret = originalSecret;
    });
  });

  describe('Signature Verification', () => {
    it('D & E & F. Fake/simulated order IDs and signatures cannot be verified', () => {
       const originalSecret = config.razorpay.keySecret;
       config.razorpay.keySecret = 'real_secret';
       
       const isValid = gateway.verifySignature('order_sim_123', 'pay_sim_123', 'fake_signature');
       expect(isValid).toBe(false);
       
       config.razorpay.keySecret = originalSecret;
    });

    it('G. A valid mocked Razorpay signature can still confirm a payment in tests', () => {
       const originalSecret = config.razorpay.keySecret;
       config.razorpay.keySecret = 'real_secret';
       
       const orderId = 'order_real_123';
       const paymentId = 'pay_real_123';
       
       const validSignature = crypto
         .createHmac('sha256', 'real_secret')
         .update(orderId + '|' + paymentId)
         .digest('hex');
         
       const isValid = gateway.verifySignature(orderId, paymentId, validSignature);
       expect(isValid).toBe(true);
       
       config.razorpay.keySecret = originalSecret;
    });
    
    it('Missing secret throws error on verification', () => {
       const originalSecret = config.razorpay.keySecret;
       config.razorpay.keySecret = 'placeholder';
       
       expect(() => gateway.verifySignature('order_1', 'pay_1', 'sig')).toThrow('Razorpay keySecret is missing or invalid.');

       config.razorpay.keySecret = originalSecret;
    });
  });

  describe('fetchPaymentRefundState', () => {
    let savedId: string, savedSecret: string;
    beforeEach(() => { savedId = config.razorpay.keyId; savedSecret = config.razorpay.keySecret; config.razorpay.keyId = 'real_id'; config.razorpay.keySecret = 'real_secret'; });
    afterEach(() => { config.razorpay.keyId = savedId; config.razorpay.keySecret = savedSecret; });

    it('maps Razorpay payment fields to the refund state shape', async () => {
      mockPaymentsFetch.mockResolvedValue({ status: 'captured', amount: 150000, amount_refunded: 0, refund_status: null });
      const state = await gateway.fetchPaymentRefundState('pay_1');
      expect(state).toEqual({ status: 'captured', amountPaise: 150000, amountRefundedPaise: 0, refundStatus: 'null' });
    });

    it('reports full refund state so the caller can reconcile without re-refunding', async () => {
      mockPaymentsFetch.mockResolvedValue({ status: 'refunded', amount: 150000, amount_refunded: 150000, refund_status: 'full' });
      const state = await gateway.fetchPaymentRefundState('pay_1');
      expect(state).toEqual({ status: 'refunded', amountPaise: 150000, amountRefundedPaise: 150000, refundStatus: 'full' });
    });

    it('throws on API error so the refund stays retryable (never silently "not refunded")', async () => {
      mockPaymentsFetch.mockRejectedValue(new Error('gateway 500'));
      await expect(gateway.fetchPaymentRefundState('pay_1')).rejects.toThrow('gateway 500');
    });
  });

  describe('refundPayment', () => {
    let savedId: string, savedSecret: string;
    beforeEach(() => { savedId = config.razorpay.keyId; savedSecret = config.razorpay.keySecret; config.razorpay.keyId = 'real_id'; config.razorpay.keySecret = 'real_secret'; });
    afterEach(() => { config.razorpay.keyId = savedId; config.razorpay.keySecret = savedSecret; });

    it('issues a refund for the exact paise amount and returns the normalized result', async () => {
      mockPaymentsRefund.mockResolvedValue({ id: 'rfnd_1', status: 'processed', amount: 75000 });
      const result = await gateway.refundPayment('pay_1', 75000, { bookingId: 'bk_1' }, 'refund_pay_1');
      expect(mockPaymentsRefund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 75000, speed: 'normal', receipt: 'refund_pay_1' }));
      expect(result).toEqual({ id: 'rfnd_1', status: 'processed', amount: 75000 });
    });

    it('propagates gateway errors so the caller keeps the refund retryable', async () => {
      mockPaymentsRefund.mockRejectedValue(new Error('refund rejected'));
      await expect(gateway.refundPayment('pay_1', 75000)).rejects.toThrow('refund rejected');
    });
  });
});
