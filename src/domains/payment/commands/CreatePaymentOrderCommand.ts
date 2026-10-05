import { Command, CommandHandler } from './types';
import { razorpayGateway } from '../RazorpayGateway';
import { firestorePaymentRepository } from '../PaymentRepository';
import { Payment } from '../Payment';

export class CreatePaymentOrderCommand implements Command {
  readonly name = 'CreatePaymentOrderCommand';
  constructor(
    public readonly bookingId: string,
    public readonly therapistId: string,
    public readonly amount: number,
    public readonly currency: string = 'INR',
    public readonly patientEmail?: string
  ) {}
}

export class CreatePaymentOrderCommandHandler implements CommandHandler<CreatePaymentOrderCommand, { orderId: string; amount: number; currency: string }> {
  async execute(command: CreatePaymentOrderCommand): Promise<{ orderId: string; amount: number; currency: string }> {
    const { bookingId, therapistId, amount, currency, patientEmail } = command;

    // 1. Create order using PaymentGateway
    const orderDetails = await razorpayGateway.createOrder({
      bookingId,
      amount,
      currency,
      therapistId
    });

    // 2. Save Payment entity in repository
    const payment = new Payment({
      id: orderDetails.orderId, // We use the order ID as the unique document ID
      bookingId,
      therapistId,
      patientEmail,
      amount,
      currency,
      razorpayOrderId: orderDetails.orderId,
      status: 'pending',
      createdAt: new Date()
    });

    await firestorePaymentRepository.save(payment);

    return orderDetails;
  }
}
