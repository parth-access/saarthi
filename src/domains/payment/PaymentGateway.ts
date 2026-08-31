export interface CreateOrderParams {
  bookingId: string;
  amount: number;
  currency: string;
  therapistId: string;
}

export interface OrderDetails {
  orderId: string;
  amount: number;
  currency: string;
}

export interface RazorpayOrderInfo {
  id: string;
  amount: number; // in paise
  currency: string;
  receipt?: string;
  status?: string;
  notes?: Record<string, unknown>;
}

export interface PaymentRefundState {
  /** Payment lifecycle status, e.g. 'captured', 'authorized', 'refunded', 'failed'. */
  status: string;
  /** Captured amount in the smallest currency unit (paise). */
  amountPaise: number;
  /** Amount already refunded in paise (0 when none). */
  amountRefundedPaise: number;
  /** Razorpay's refund coverage: 'null' | 'partial' | 'full'. */
  refundStatus: string;
}

export interface RefundResult {
  id: string;
  status: string;
  /** Refunded amount in paise. */
  amount: number;
}

export interface PaymentGateway {
  createOrder(params: CreateOrderParams): Promise<OrderDetails>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
  findOrderByReceipt?(receipt: string): Promise<RazorpayOrderInfo | null>;
  /** Reads authoritative capture/refund state for a payment (idempotency reconcile). */
  fetchPaymentRefundState?(paymentId: string): Promise<PaymentRefundState | null>;
  /** Issues a (possibly partial) refund against a captured payment. */
  refundPayment?(
    paymentId: string,
    amountPaise: number,
    notes?: Record<string, string | number>,
    receipt?: string
  ): Promise<RefundResult>;
}
