/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { auditService } from '@/domains/audit/AuditService';
import { logger } from '@/shared/logger';

export function registerAuditListeners(eventBus: any) {
  // Helper to log a sub-collection audit log safely
  async function logBookingSubCollectionAudit(bookingId: string, action: string, details: string, extra: Record<string, any> = {}) {
    if (!adminDb) return;
    try {
      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      await auditRef.set({
        action,
        timestamp: FieldValue.serverTimestamp(),
        details,
        ...extra
      });
    } catch (err) {
      logger.error(`[AuditListener] Failed to write sub-collection audit log for booking ${bookingId}`, { error: err });
    }
  }

  // 1. Booking Events
  eventBus.subscribe('BookingSlotLocked', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await auditService.logEvent('BOOKING_UPDATED', { message: 'Slot locked' }, booking.userId, bookingId);
    await logBookingSubCollectionAudit(bookingId, 'slot_locked', 'Booking slot locked.');
  });

  eventBus.subscribe('BookingAwaitingPayment', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await auditService.logEvent('PAYMENT_LINK_SENT', { amount: booking.paymentAmount, currency: booking.paymentCurrency }, booking.userId, bookingId);
    await logBookingSubCollectionAudit(bookingId, 'awaiting_payment', 'Payment order generated and awaiting payment.');
  });

  eventBus.subscribe('BookingPaymentInitiated', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await auditService.logEvent('PAYMENT_STARTED', {}, booking.userId, bookingId);
    await logBookingSubCollectionAudit(bookingId, 'payment_initiated', 'Payment process initiated by client.');
  });

  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId, booking, metadata } = event.payload;
    const source = metadata?.source || 'direct';
    const actorId = booking.userId || 'system';

    await auditService.logEvent('BOOKING_UPDATED', { status: 'confirmed', source }, actorId, bookingId);
    await auditService.logEvent('PAYMENT_SUCCESS', { amount: booking.paymentAmount, currency: booking.paymentCurrency, source }, actorId, bookingId);

    const detailMsg = source === 'webhook' 
      ? 'Payment verified via webhook reconciliation.'
      : 'Payment verified for booking.';
    await logBookingSubCollectionAudit(bookingId, source === 'webhook' ? 'payment_verified_webhook' : 'payment_verified', detailMsg);
  });

  eventBus.subscribe('BookingCompleted', async (event: any) => {
    const { bookingId } = event.payload;
    await auditService.logEvent('SESSION_COMPLETED', { status: 'completed' }, 'system', bookingId);
    await logBookingSubCollectionAudit(bookingId, 'completed', 'Booking marked as completed.');
  });

  eventBus.subscribe('BookingNoShow', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await auditService.logEvent('SESSION_NO_SHOW', { status: 'no_show', reason: booking?.declineReason }, 'system', bookingId);
    await logBookingSubCollectionAudit(bookingId, 'no_show', `Session marked as no-show: ${booking?.declineReason || 'Student did not attend'}`);
  });

  eventBus.subscribe('ReviewSubmitted', async (event: any) => {
    const { reviewId, bookingId, rating, studentId, therapistId } = event.payload;
    await auditService.logEvent('REVIEW_SUBMITTED', { reviewId, rating, therapistId }, studentId, bookingId);
    await logBookingSubCollectionAudit(bookingId, 'review_submitted', `Review submitted with ${rating} star rating.`, {
      reviewId,
      rating
    });
  });

  eventBus.subscribe('BookingCancelled', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await auditService.logEvent('BOOKING_UPDATED', { status: 'cancelled', reason: booking.declineReason }, 'system', bookingId);
    await logBookingSubCollectionAudit(bookingId, 'status_updated', `Booking cancelled: ${booking.declineReason}`, {
      status: 'cancelled',
      reason: booking.declineReason
    });
  });

  eventBus.subscribe('BookingRejected', async (event: any) => {
    const { bookingId, booking } = event.payload;
    const actor = booking.declinedBy || 'system';
    await auditService.logEvent('BOOKING_UPDATED', { status: 'rejected', reason: booking.declineReason }, actor, bookingId);
    await logBookingSubCollectionAudit(bookingId, 'status_updated', `Booking declined: ${booking.declineReason}`, {
      status: 'rejected',
      reason: booking.declineReason,
      userId: actor
    });
  });

  eventBus.subscribe('BookingExpired', async (event: any) => {
    const { bookingId } = event.payload;
    await auditService.logEvent('BOOKING_UPDATED', { status: 'expired' }, 'system', bookingId);
    await logBookingSubCollectionAudit(bookingId, 'expired', 'Booking expired due to inactivity.');
  });

  eventBus.subscribe('BookingRescheduled', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await auditService.logEvent('BOOKING_UPDATED', { status: 'rescheduled', date: booking.date, time: booking.time }, 'system', bookingId);
    await logBookingSubCollectionAudit(bookingId, 'rescheduled', `Booking rescheduled to ${booking.date} at ${booking.time}`);
  });

  // 2. Payment Events
  eventBus.subscribe('PaymentInitiated', async (event: any) => {
    const { payment } = event.payload;
    await auditService.logEvent('PAYMENT_STARTED', { amount: payment.amount, currency: payment.currency }, 'system', payment.bookingId);
  });

  eventBus.subscribe('PaymentSuccess', async (event: any) => {
    const { payment } = event.payload;
    await auditService.logEvent('PAYMENT_SUCCESS', { amount: payment.amount, currency: payment.currency, rzpPaymentId: payment.razorpayPaymentId }, 'system', payment.bookingId);
  });

  eventBus.subscribe('PaymentFailed', async (event: any) => {
    const { payment } = event.payload;
    await auditService.logEvent('PAYMENT_FAILED', { amount: payment.amount, currency: payment.currency }, 'system', payment.bookingId);
  });
}
