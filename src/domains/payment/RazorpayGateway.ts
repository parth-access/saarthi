import Razorpay from 'razorpay';
import crypto from 'crypto';
import { PaymentGateway, CreateOrderParams, OrderDetails, RazorpayOrderInfo, PaymentRefundState, RefundResult } from './PaymentGateway';
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

  async fetchPayment(paymentId: string): Promise<{ id: string; order_id: string; status: string; amount: number; currency: string } | null> {
    try {
      const rzp = this.getClient();
      const payment = await rzp.payments.fetch(paymentId);
      return payment as unknown as { id: string; order_id: string; status: string; amount: number; currency: string };
    } catch (error) {
      console.error('[Razorpay] Failed to fetch payment details', error);
      return null;
    }
  }

  /**
   * Reads the authoritative capture + refund state of a payment straight from
   * Razorpay. Used before issuing a refund so we never double-refund: if the
   * payment already shows `refund_status: 'full'` (or enough `amount_refunded`),
   * the caller reconciles instead of refunding again. Throws on API error so the
   * refund is retried rather than silently treated as "not refunded".
   */
  async fetchPaymentRefundState(paymentId: string): Promise<PaymentRefundState | null> {
    const rzp = this.getClient();
    const payment = await rzp.payments.fetch(paymentId);
    if (!payment) return null;
    const p = payment as unknown as {
      status: string;
      amount: number;
      amount_refunded?: number;
      refund_status?: string;
    };
    return {
      status: p.status,
      amountPaise: Number(p.amount) || 0,
      amountRefundedPaise: Number(p.amount_refunded) || 0,
      refundStatus: p.refund_status || 'null',
    };
  }

  /**
   * Issues a refund against a captured payment. `amountPaise` is the amount in the
   * smallest currency unit; `receipt` is our internal reference (the deterministic
   * refund doc id) so refunds are traceable back to our records. Throws on failure
   * so the caller keeps the refund retryable and does NOT mark the booking refunded.
   */
  async refundPayment(
    paymentId: string,
    amountPaise: number,
    notes?: Record<string, string | number>,
    receipt?: string
  ): Promise<RefundResult> {
    const rzp = this.getClient();
    const refund = await rzp.payments.refund(paymentId, {
      amount: amountPaise,
      speed: 'normal',
      notes,
      receipt: receipt ?? null,
    });
    const r = refund as unknown as { id: string; status: string; amount: number };
    return { id: r.id, status: r.status, amount: Number(r.amount) || amountPaise };
  }

  async findOrderByReceipt(receipt: string): Promise<RazorpayOrderInfo | null> {
    try {
      const rzp = this.getClient();
      type OrdersWithAll = { all: (params: { receipt: string }) => Promise<{ items?: Array<{ id: string; amount: number; currency: string; receipt?: string; status?: string; notes?: Record<string, unknown> }> }> };
      const response = await (rzp.orders as unknown as OrdersWithAll).all({ receipt });
      if (response && Array.isArray(response.items) && response.items.length > 0) {
        const match = response.items.find((item) => item.receipt === receipt);
        if (match) {
          return {
            id: match.id,
            amount: match.amount, // in paise
            currency: match.currency,
            receipt: match.receipt,
            status: match.status,
            notes: match.notes
          };
        }
      }
      return null;
    } catch (error) {
      console.error('[Razorpay] Failed to fetch order by receipt', error);
      throw error;
    }
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
