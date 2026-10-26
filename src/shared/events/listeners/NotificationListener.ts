/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/shared/logger';

// Placeholders for SMS/WhatsApp alerts. They log the booking id only: the
// patient's name and phone must never reach application logs.
export function registerNotificationListeners(eventBus: any) {
  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId } = event.payload;
    logger.info(`[NotificationListener] Booking confirmed alert pending for booking ${bookingId}`);
  });

  eventBus.subscribe('BookingAwaitingPayment', async (event: any) => {
    const { bookingId } = event.payload;
    logger.info(`[NotificationListener] Payment reminder pending for booking ${bookingId}`);
  });
}
