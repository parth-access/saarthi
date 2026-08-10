import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentGateway, CreateOrderParams, OrderDetails } from './PaymentGateway';
import { config } from '@/shared/config';

export class RazorpayGateway implements PaymentGateway {
  private getClient(): Razorpay {
    const key_id = config.razorpay.keyId;
    const key_secret = config.razorpay.keySecret;
    
    if (!key_id || !key_secret || key_id === 'rzp_test_placeholder' || key_secret === 'placeholder') {
      throw new Error('Razorpay keys are not configured properly. Payment cannot proceed.');
    }
    
    return new Razorpay({
      key_id,
      key_secret
    });
  }

  async createOrder(params: CreateOrderParams): Promise<OrderDetails> {
    try {
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
    } catch (error) {
      console.error('[Razorpay] Failed to create order', error);
      throw error;
    }
  }

  verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = config.razorpay.keySecret;
    if (!secret || secret === 'placeholder') {
      throw new Error('Razorpay keySecret is missing or invalid.');
    }
    
    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    return generated_signature === signature;
  }
}

export const razorpayGateway = new RazorpayGateway();
