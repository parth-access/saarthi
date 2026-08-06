import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentGateway, CreateOrderParams, OrderDetails } from './PaymentGateway';
import { config } from '@/shared/config';

export class RazorpayGateway implements PaymentGateway {
  private getClient(): Razorpay {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error('Razorpay credentials are not configured');
    }
    return new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret
    });
  }

  async createOrder(params: CreateOrderParams): Promise<OrderDetails> {
    const isTestEnv = process.env.NODE_ENV === 'test';
    const isPlaceholder = !config.razorpay.keyId || !config.razorpay.keySecret;

    if (isTestEnv && isPlaceholder) {
      console.warn('[Razorpay] Using simulated mock payment order for test environment.');
      return {
        orderId: `order_sim_${crypto.randomUUID().replace(/-/g, '').substring(0, 14)}`,
        amount: params.amount,
        currency: params.currency
      };
    }

    const rzp = this.getClient();
    const order = await rzp.orders.create({
      amount: params.amount * 100, // Razorpay expects amount in paise
      currency: params.currency,
      receipt: `receipt_${params.bookingId}`,
      notes: {
        bookingId: params.bookingId,
        therapistId: params.therapistId
      }
    });

    return {
      orderId: order.id,
      amount: params.amount,
      currency: params.currency
    };
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const isTestEnv = process.env.NODE_ENV === 'test';
    if (isTestEnv && orderId.startsWith('order_sim_') && signature === 'sim_signature') {
      return true;
    }

    const secret = config.razorpay.keySecret;
    if (!secret) {
      throw new Error('Razorpay keySecret is missing');
    }

    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    return generated_signature === signature;
  }
}

export const razorpayGateway = new RazorpayGateway();
