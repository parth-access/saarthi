/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/shared/logger';

export function registerTimelineListeners(eventBus: any) {
  async function writeTimelineEntry(entry: {
    correlationId: string;
    bookingId?: string;
    paymentId?: string;
    emailId?: string;
    actor: {
      type: "system" | "patient" | "therapist" | "admin" | "worker" | "webhook";
      id?: string;
    };
    event: string;
    severity: "info" | "warning" | "error";
    message: string;
    metadata: Record<string, any>;
  }) {
    if (!adminDb) return;
    try {
      const docRef = adminDb.collection('timelines').doc();
      await docRef.set({
        id: docRef.id,
        ...entry,
        createdAt: FieldValue.serverTimestamp()
      });
    } catch (err) {
      logger.error(`[TimelineListener] Failed to write timeline entry for event ${entry.event}`, { error: err });
    }
  }

  // 1. Booking Events
  eventBus.subscribe('BookingSlotLocked', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'patient', id: booking?.userId },
      event: event.name,
      severity: 'info',
      message: `Slot locked for therapist ${booking?.therapistName || booking?.therapistId || ''}.`,
      metadata: { date: booking?.date, time: booking?.time }
    });
  });

  eventBus.subscribe('BookingAwaitingPayment', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'system' },
      event: event.name,
      severity: 'info',
      message: 'Booking request approved, awaiting payment.',
      metadata: { amount: booking?.paymentAmount, currency: booking?.paymentCurrency, orderId: booking?.razorpayOrderId }
    });
  });

  eventBus.subscribe('BookingPaymentInitiated', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'patient', id: booking?.userId },
      event: event.name,
      severity: 'info',
      message: 'Payment checkout opened by patient.',
      metadata: { amount: booking?.paymentAmount }
    });
  });

  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId, booking, metadata } = event.payload;
    const source = metadata?.source || 'direct';
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: source === 'webhook' ? 'webhook' : 'patient', id: booking?.userId },
      event: event.name,
      severity: 'info',
      message: `Booking confirmed successfully. Verified via ${source}.`,
      metadata: { therapistId: booking?.therapistId, paymentAmount: booking?.paymentAmount }
    });
  });

  eventBus.subscribe('BookingCompleted', async (event: any) => {
    const { bookingId } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'system' },
      event: event.name,
      severity: 'info',
      message: 'Therapy booking marked as completed.',
      metadata: {}
    });
  });

  eventBus.subscribe('BookingCancelled', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'patient', id: booking?.userId },
      event: event.name,
      severity: 'info',
      message: `Booking cancelled. Reason: ${booking?.declineReason || 'Not specified'}.`,
      metadata: { reason: booking?.declineReason }
    });
  });

  eventBus.subscribe('BookingRejected', async (event: any) => {
    const { bookingId, booking } = event.payload;
    const actorType = booking?.declinedBy === 'therapist' ? 'therapist' : 'admin';
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: actorType, id: booking?.declinedBy },
      event: event.name,
      severity: 'info',
      message: `Booking declined. Reason: ${booking?.declineReason || 'Not specified'}.`,
      metadata: { reason: booking?.declineReason, customNote: booking?.declineCustomNote }
    });
  });

  eventBus.subscribe('BookingExpired', async (event: any) => {
    const { bookingId } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'system' },
      event: event.name,
      severity: 'warning',
      message: 'Booking slot lock expired due to non-payment.',
      metadata: {}
    });
  });

  eventBus.subscribe('BookingRescheduled', async (event: any) => {
    const { bookingId, booking } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      actor: { type: 'system' },
      event: event.name,
      severity: 'info',
      message: `Booking rescheduled to ${booking?.date} at ${booking?.time}.`,
      metadata: { date: booking?.date, time: booking?.time }
    });
  });

  // 2. Payment Events
  eventBus.subscribe('PaymentInitiated', async (event: any) => {
    const { payment } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId: payment?.bookingId,
      paymentId: payment?.id,
      actor: { type: 'patient' },
      event: event.name,
      severity: 'info',
      message: `Payment initialization for ${payment?.amount} ${payment?.currency} at Razorpay.`,
      metadata: { orderId: payment?.razorpayOrderId }
    });
  });

  eventBus.subscribe('PaymentSuccess', async (event: any) => {
    const { payment } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId: payment?.bookingId,
      paymentId: payment?.id,
      actor: { type: 'webhook' },
      event: event.name,
      severity: 'info',
      message: `Payment successful on gateway: ${payment?.razorpayPaymentId}.`,
      metadata: { orderId: payment?.razorpayOrderId, paymentId: payment?.razorpayPaymentId }
    });
  });

  eventBus.subscribe('PaymentFailed', async (event: any) => {
    const { payment } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId: payment?.bookingId,
      paymentId: payment?.id,
      actor: { type: 'webhook' },
      event: event.name,
      severity: 'error',
      message: `Payment failed on gateway.`,
      metadata: { orderId: payment?.razorpayOrderId }
    });
  });

  // 3. Email Events
  eventBus.subscribe('EmailEnqueued', async (event: any) => {
    const { emailId, bookingId, type, recipient } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      emailId,
      actor: { type: 'worker' },
      event: event.name,
      severity: 'info',
      message: `Email enqueued for sending. Type: ${type}, Recipient: ${recipient}.`,
      metadata: { type, recipient }
    });
  });

  eventBus.subscribe('EmailSent', async (event: any) => {
    const { emailId, bookingId, type, recipient, response } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      emailId,
      actor: { type: 'worker' },
      event: event.name,
      severity: 'info',
      message: `Email sent successfully. Type: ${type}, Recipient: ${recipient}.`,
      metadata: { type, recipient, resendId: response?.id }
    });
  });

  eventBus.subscribe('EmailFailed', async (event: any) => {
    const { emailId, bookingId, type, recipient, error } = event.payload;
    await writeTimelineEntry({
      correlationId: event.correlationId || '',
      bookingId,
      emailId,
      actor: { type: 'worker' },
      event: event.name,
      severity: 'error',
      message: `Email sending failed. Error: ${error}.`,
      metadata: { type, recipient, error }
    });
  });
}
