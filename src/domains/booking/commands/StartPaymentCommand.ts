import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '../repository/FirestoreBookingRepository';
import { BookingDomainService } from '../services/BookingDomainService';

export class StartPaymentCommand implements Command {
  readonly name = 'StartPaymentCommand';
  constructor(public readonly bookingId: string) {}
}

export class StartPaymentCommandHandler implements CommandHandler<StartPaymentCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: StartPaymentCommand): Promise<{ success: boolean }> {
    const { bookingId } = command;

    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) throw new Error('Booking not found');

      await this.bookingDomainService.initiatePayment(data, transaction);
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, transaction);

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      transaction.set(auditRef, {
        action: 'payment_initiated',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Payment started by patient'
      });
    });

    return { success: true };
  }
}
