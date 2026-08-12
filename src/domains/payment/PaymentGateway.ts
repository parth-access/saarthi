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

export interface PaymentGateway {
  createOrder(params: CreateOrderParams): Promise<OrderDetails>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
  findOrderByReceipt?(receipt: string): Promise<RazorpayOrderInfo | null>;
}
