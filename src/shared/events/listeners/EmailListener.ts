/* eslint-disable @typescript-eslint/no-explicit-any */
import { sendEmailAction } from '@/app/api/email/emailSender';
import { logger } from '@/shared/logger';

export function registerEmailListeners(eventBus: any) {
  // NOTE: The session-confirmation email is intentionally NOT sent here.
  // It is dispatched by GoogleCalendarService.createOrSyncCalendarEvent AFTER the real
  // Google Meet link exists, so the customer never receives a confirmation without a link
  // (and never a fabricated one). The immediate payment-receipt email is sent separately
  // by ConfirmBookingCommand, so payment is still acknowledged even if calendar is pending.

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
