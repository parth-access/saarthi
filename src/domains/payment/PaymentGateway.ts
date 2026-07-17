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

export interface PaymentGateway {
  createOrder(params: CreateOrderParams): Promise<OrderDetails>;
  verifySignature(orderId: string, paymentId: string, signature: string): boolean;
}
