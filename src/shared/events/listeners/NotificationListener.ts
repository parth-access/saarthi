/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/shared/logger';

export function registerNotificationListeners(eventBus: any) {
  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId, booking } = event.payload;
    logger.info(`[NotificationListener] Send SMS/WhatsApp Alert to patient ${booking.name} (${booking.phone}): "Your booking ${bookingId} has been confirmed for ${booking.date} at ${booking.time}."`);
  });

  eventBus.subscribe('BookingAwaitingPayment', async (event: any) => {
    const { bookingId, booking } = event.payload;
    logger.info(`[NotificationListener] Send SMS/WhatsApp Payment Link to patient ${booking.name} (${booking.phone}): "Complete your booking payment: ${bookingId}."`);
  });
}
