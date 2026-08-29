/* eslint-disable @typescript-eslint/no-explicit-any */
import { sendEmailAction } from '@/app/api/email/emailSender';
import { logger } from '@/shared/logger';

export function registerEmailListeners(eventBus: any) {
  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId, booking } = event.payload;
    try {
      await sendEmailAction({
        type: 'booking-confirmed',
        bookingId: bookingId,
        therapistId: booking.therapistId,
        bookingDetails: {
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          date: booking.date,
          time: booking.time,
        }
      });
      logger.info(`[EmailListener] Confirmation email triggered successfully for booking ${bookingId}`);
    } catch (err) {
      logger.error(`[EmailListener] Failed to trigger confirmation email for booking ${bookingId}`, { error: err, bookingId });
      throw err;
    }
  });

  eventBus.subscribe('BookingRejected', async (event: any) => {
    const { bookingId, booking } = event.payload;
    try {
      await sendEmailAction({
        type: 'booking-declined',
        bookingId: bookingId,
        therapistId: booking.therapistId,
        declineReason: booking.declineReason,
        declineCustomNote: booking.declineCustomNote || '',
        bookingDetails: {
          name: booking.name,
          email: booking.email,
          date: booking.date,
          time: booking.time,
        }
      });
      logger.info(`[EmailListener] Decline email triggered successfully for booking ${bookingId}`);
    } catch (err) {
      logger.error(`[EmailListener] Failed to trigger decline email for booking ${bookingId}`, { error: err, bookingId });
      throw err;
    }
  });

  eventBus.subscribe('PaymentFailed', async (event: any) => {
    const { bookingId, therapistId, razorpayOrderId, reason } = event.payload;
    try {
      await sendEmailAction({
        type: 'payment-failed',
        bookingId,
        therapistId,
        paymentDetails: {
          orderId: razorpayOrderId,
          failureReason: reason,
        }
      });
      logger.info(`[EmailListener] Payment failed notification email sent for booking ${bookingId}`);
    } catch (err) {
      logger.error(`[EmailListener] Failed to send payment failed email for booking ${bookingId}`, { error: err, bookingId });
      throw err;
    }
  });

  eventBus.subscribe('SlotReleased', async (event: any) => {
    const { bookingId, therapistId, reason } = event.payload;
    try {
      await sendEmailAction({
        type: 'booking-slot-released',
        bookingId,
        therapistId,
        declineReason: reason,
      });
      logger.info(`[EmailListener] Slot released notification email sent for booking ${bookingId}`);
    } catch (err) {
      logger.error(`[EmailListener] Failed to send slot released email for booking ${bookingId}`, { error: err, bookingId });
      throw err;
    }
  });
}
