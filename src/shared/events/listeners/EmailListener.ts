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
      logger.error(`[EmailListener] Failed to trigger confirmation email for booking ${bookingId}`, { error: String(err) });
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
      logger.error(`[EmailListener] Failed to trigger decline email for booking ${bookingId}`, { error: String(err) });
    }
  });
}
