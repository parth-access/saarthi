import { Command, CommandHandler } from './types';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository, BookingDomainService } from '@/domains/booking';
import { sendEmailAction } from '@/app/api/email/emailSender';

export class CancelBookingCommand implements Command {
  readonly name = 'CancelBookingCommand';
  constructor(
    public readonly bookingId: string,
    public readonly reason: string,
    public readonly cancelledBy: string,
    public readonly sessionRole?: string,
    public readonly customNote?: string
  ) {}
}

export class CancelBookingCommandHandler implements CommandHandler<CancelBookingCommand, { success: boolean }> {
  private readonly bookingDomainService = new BookingDomainService(firestoreBookingRepository);

  async execute(command: CancelBookingCommand): Promise<{ success: boolean }> {
    const { bookingId, reason, cancelledBy, sessionRole, customNote } = command;

    const { bookingData, therapistId } = await adminDb.runTransaction(async (t) => {
      const data = await firestoreBookingRepository.findById(bookingId, t);
      if (!data) throw new Error('Booking not found');

      if (sessionRole === 'therapist') {
        const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
        if (!therapistDoc.exists || therapistDoc.data()?.authId !== cancelledBy) {
          throw new Error('Unauthorized to modify this booking');
        }
      }

      // If booking is pending/awaiting_payment/confirmed, we can decline/cancel
      const isDecline = data.status === 'pending' || data.status === 'pending_approval' || data.status === 'awaiting_payment';

      if (isDecline) {
        await this.bookingDomainService.declineBooking(
          data,
          reason,
          cancelledBy,
          customNote,
          FieldValue.serverTimestamp(),
          t
        );
      } else {
        await this.bookingDomainService.cancelBooking(data, reason, t);
      }

      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, t);

      const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
      const slotRef = adminDb.collection('locked_slots').doc(slotId);
      t.delete(slotRef);

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'status_updated',
        status: isDecline ? 'rejected' : 'cancelled',
        reason,
        timestamp: FieldValue.serverTimestamp(),
        details: isDecline ? `Booking declined: ${reason}` : `Booking cancelled: ${reason}`,
        userId: cancelledBy
      });

      return { bookingData: data, therapistId: data.therapistId };
    });

    try {
      const isDecline = bookingData.status === 'rejected';
      if (isDecline) {
        await sendEmailAction({
          type: 'booking-declined',
          bookingId,
          therapistId,
          declineReason: reason,
          declineCustomNote: customNote,
          bookingDetails: {
            name: bookingData.name,
            email: bookingData.email,
            date: bookingData.date,
            time: bookingData.time,
          }
        });
      } else {
        // Send generic cancellation/update email if needed or requested
      }
    } catch (err) {
      console.error('Failed to send decline/cancellation email:', err);
    }

    return { success: true };
  }
}
