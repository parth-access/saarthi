import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository, BookingDomainService } from '@/domains/booking';
import { ConfirmPaymentCommand, ConfirmPaymentCommandHandler } from '@/domains/payment';
import { logger } from '@/app/api/_lib/logger';

export class ConfirmBookingCommand implements Command {
  readonly name = 'ConfirmBookingCommand';
  constructor(
    public readonly bookingId: string,
    public readonly razorpayPaymentId: string,
    public readonly razorpayOrderId: string,
    public readonly razorpaySignature?: string,
    public readonly source: string = 'direct'
  ) {}
}

export class ConfirmBookingCommandHandler implements CommandHandler<ConfirmBookingCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: ConfirmBookingCommand): Promise<{ success: boolean }> {
    const { bookingId, razorpayPaymentId, razorpayOrderId, razorpaySignature, source } = command;

    // 1. Confirm and verify payment in the Payment Domain
    const confirmPaymentCommand = new ConfirmPaymentCommand(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      source
    );
    const confirmPaymentHandler = new ConfirmPaymentCommandHandler();
    await confirmPaymentHandler.execute(confirmPaymentCommand);

    // 2. Update booking state in transaction
    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) throw new Error('Booking not found');

      if (data.status === 'confirmed' && data.paymentStatus === 'paid') {
        return;
      }

      const verifiedAt = FieldValue.serverTimestamp();
      await this.bookingDomainService.confirmPayment(data, verifiedAt, razorpayPaymentId, transaction);
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, transaction);
    });

    logger.success('PAYMENT', `Payment verified completely via ${source}`, { bookingId, razorpayPaymentId });
    return { success: true };
  }
}

