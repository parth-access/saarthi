import { db } from '../../api/firebase-admin.js';
import { AppError } from '../utils/error.js';
import { BookingInput } from '../validators/booking.schema.js';
import { emailService } from './email.service.js';

export const bookingService = {
  async createBooking(input: BookingInput) {
    let bookingId = '';
    let therapistName = 'one of our specialists';

    await db.runTransaction(async (transaction) => {
      // 1. Double-booking check
      const existingQuery = db.collection('bookings')
        .where('therapistId', '==', input.therapistId)
        .where('date', '==', input.date)
        .where('time', '==', input.time)
        .where('status', 'in', ['confirmed', 'pending']);
      
      const existingDocs = await transaction.get(existingQuery);
      if (!existingDocs.empty) {
        throw new AppError('This time slot was just booked by someone else.', 409, 'SLOT_OCCUPIED');
      }

      // 2. Validate Lock
      const lockRef = db.collection('locks').doc(input.lockId);
      const lockDoc = await transaction.get(lockRef);
      
      if (!lockDoc.exists) {
        throw new AppError('Your reservation is no longer valid. Please choose a different time.', 409, 'INVALID_LOCK');
      }
      
      const lockData = lockDoc.data();
      const now = new Date();
      
      if (!lockData || lockData.expiresAt.toDate() < now) {
        throw new AppError('Your time slot reservation has expired.', 409, 'EXPIRED_LOCK');
      }
      
      if (lockData.therapistId !== input.therapistId || lockData.date !== input.date || lockData.time !== input.time) {
        throw new AppError('Session data mismatch. Please try again.', 400, 'LOCK_MISMATCH');
      }

      // 3. Get therapist name
      const therapistRef = db.collection('therapists').doc(input.therapistId);
      const therapistDoc = await transaction.get(therapistRef);
      if (therapistDoc.exists) {
        therapistName = therapistDoc.data()?.name || therapistName;
      }

      // 4. Create booking
      const newBookingRef = db.collection('bookings').doc();
      bookingId = newBookingRef.id;

      transaction.set(newBookingRef, {
        ...input,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 5. Consume lock
      transaction.delete(lockRef);
    });

    // Send email asynchronously
    emailService.sendBookingRequest({
      userName: input.name,
      userEmail: input.email,
      therapistName,
      date: input.date,
      time: input.time,
      sessionType: input.sessionType
    });

    return { id: bookingId };
  },

  async updateStatus(id: string, status: string) {
    const bookingRef = db.collection('bookings').doc(id);
    const bookingDoc = await bookingRef.get();

    if (!bookingDoc.exists) {
      throw new AppError('Booking not found', 404);
    }

    const booking = bookingDoc.data();
    if (!booking) throw new AppError('Invalid booking data', 500);

    // Validate status transition
    const currentStatus = booking.status;
    const allowedTransitions: Record<string, string[]> = {
      'pending': ['confirmed', 'rejected', 'cancelled'],
      'confirmed': ['completed', 'cancelled'],
      'rejected': [],
      'completed': [],
      'cancelled': []
    };

    if (!allowedTransitions[currentStatus]?.includes(status)) {
      throw new AppError(`Cannot move from ${currentStatus} to ${status}`, 400);
    }

    await bookingRef.update({ 
      status,
      updatedAt: new Date()
    });

    // Handle notifications
    const therapistDoc = await db.collection('therapists').doc(booking.therapistId).get();
    const therapistName = therapistDoc.exists ? therapistDoc.data()?.name : 'your specialist';
    
    const emailParams = {
      userName: booking.name,
      userEmail: booking.email,
      therapistName,
      date: booking.date,
      time: booking.time,
      sessionType: booking.sessionType
    };

    if (status === 'confirmed') {
      emailService.sendBookingConfirmation(emailParams);
    } else if (status === 'rejected') {
      emailService.sendBookingRejection(emailParams);
    }

    return { success: true };
  }
};
