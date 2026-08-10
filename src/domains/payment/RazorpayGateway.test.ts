import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RazorpayGateway } from './RazorpayGateway';
import { config } from '@/shared/config';
import crypto from 'crypto';

// Mock Razorpay SDK
vi.mock('razorpay', () => {
  return {
    default: class MockRazorpay {
      orders = {
        create: vi.fn().mockImplementation((params: Record<string, unknown> & { amount: number; currency: string }) => {
          if (params.amount < 0) return Promise.reject(new Error('Invalid amount'));
          return Promise.resolve({ id: 'order_real_123', amount: params.amount, currency: params.currency });
        })
      };
    }
  };
});

describe('RazorpayGateway', () => {
  let gateway: RazorpayGateway;
  
  beforeEach(() => {
    gateway = new RazorpayGateway();
    vi.resetModules();
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
});
