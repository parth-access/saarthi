import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentGateway, CreateOrderParams, OrderDetails } from './PaymentGateway';
import { config } from '@/shared/config';

export class RazorpayGateway implements PaymentGateway {
  private getClient(): Razorpay {
    return new Razorpay({
      key_id: config.razorpay.keyId || 'rzp_test_placeholder',
      key_secret: config.razorpay.keySecret || 'placeholder'
    });
  }

  async createOrder(params: CreateOrderParams): Promise<OrderDetails> {
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
    const secret = config.razorpay.keySecret || 'placeholder';
    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    return generated_signature === signature;
  }
}

export const razorpayGateway = new RazorpayGateway();
