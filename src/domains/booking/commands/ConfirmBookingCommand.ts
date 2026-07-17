import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository, BookingDomainService } from '@/domains/booking';
import { sendEmailAction } from '@/app/api/email/emailSender';
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

    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) throw new Error('Booking not found');

      if (data.status === 'confirmed' && data.paymentStatus === 'paid') {
        return;
      }

      const paymentRef = adminDb.collection('payments').doc(razorpayPaymentId);
      transaction.set(paymentRef, {
        bookingId,
        therapistId: data.therapistId,
        patientEmail: data.email,
        amount: data.paymentAmount || (data.sessionMode === 'in_person' ? 2000 : 1500),
        currency: data.paymentCurrency || 'INR',
        razorpayOrderId,
        razorpayPaymentId,
        ...(razorpaySignature ? { razorpaySignature } : {}),
        status: 'success',
        source,
        createdAt: FieldValue.serverTimestamp(),
        verifiedAt: FieldValue.serverTimestamp()
      });

      const verifiedAt = FieldValue.serverTimestamp();
      await this.bookingDomainService.confirmPayment(data, verifiedAt, razorpayPaymentId, transaction);
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, transaction);

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: source === 'webhook' ? 'payment_verified_webhook' : 'payment_verified',
        timestamp: FieldValue.serverTimestamp(),
        details: source === 'webhook' 
          ? 'Payment verified via webhook reconciliation.'
          : 'Payment verified for booking.'
      });
    });

    const updatedBooking = await firestoreBookingRepository.findById(bookingId);
    if (!updatedBooking) throw new Error('Booking not found post-transaction');

    try {
      await sendEmailAction({
        type: 'booking-confirmed',
        bookingId: updatedBooking.id,
        therapistId: updatedBooking.therapistId,
        bookingDetails: {
          name: updatedBooking.name,
          email: updatedBooking.email,
          phone: updatedBooking.phone,
          date: updatedBooking.date,
          time: updatedBooking.time,
        }
      });
    } catch (err) {
      logger.warn('PAYMENT', 'Failed to trigger confirmation email', { error: String(err), bookingId });
    }

    logger.success('PAYMENT', `Payment verified completely via ${source}`, { bookingId, razorpayPaymentId });
    return { success: true };
  }
}
