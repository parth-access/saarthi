import { db } from '../../api/firebase-admin.js';
import { AppError } from '../utils/error.js';
import { BookingInput } from '../validators/booking.schema.js';
import { analyticsService } from './analytics.service.js';
import { queueService } from './queue.service.js';
import { logger } from '../logger.js';

export const bookingService = {
  async createBooking(input: BookingInput, meta: { requestId?: string } = {}) {
    const { requestId } = meta;
    let bookingId = '';
    let therapistName = 'one of our specialists';

    // Idempotency: check if identical booking exists in last 5 mins
    const recentCheck = await db.collection('bookings')
      .where('email', '==', input.email)
      .where('date', '==', input.date)
      .where('time', '==', input.time)
      .where('therapistId', '==', input.therapistId)
      .where('createdAt', '>', new Date(Date.now() - 5 * 60 * 1000))
      .limit(1)
      .get();

    if (!recentCheck.empty) {
      logger.warn('Duplicate booking attempt detected', { ...input, requestId });
      throw new AppError('A booking request with these details was recently received. Please check your email.', 409, 'DUPLICATE_BOOKING');
    }

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
        requestId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 5. Consume lock
      transaction.delete(lockRef);
    });

    logger.info('Booking created successfully', { bookingId, requestId, userEmail: input.email });

    // Track analytics
    await analyticsService.trackEvent('booking_request', { 
      requestId, 
      metadata: { therapistId: input.therapistId, sessionType: input.sessionType } 
    });

    // Enqueue email job
    await queueService.enqueueEmail('request', {
      userName: input.name,
      userEmail: input.email,
      therapistName,
      date: input.date,
      time: input.time,
      sessionType: input.sessionType
    });

    return { bookingId, therapistName };
  },

  async updateStatus(id: string, status: string, meta: { requestId?: string } = {}) {
    const { requestId } = meta;
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
      updatedAt: new Date(),
      lastModifiedBy: 'admin', // Placeholder for actual admin userId
      lastRequestId: requestId
    });

    logger.info('Booking status updated', { bookingId: id, from: currentStatus, to: status, requestId });

    // Handle analytics
    if (status === 'confirmed') {
      await analyticsService.trackEvent('booking_confirm', { requestId, metadata: { bookingId: id } });
    }

    // Handle notifications via queue
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
      await queueService.enqueueEmail('confirmation', emailParams);
    } else if (status === 'rejected') {
      await queueService.enqueueEmail('rejection', emailParams);
    }

    return { bookingId: id, status };
  }
};
