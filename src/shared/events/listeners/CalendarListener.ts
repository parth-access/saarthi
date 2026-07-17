/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/shared/logger';

export function registerCalendarListeners(eventBus: any) {
  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId, booking } = event.payload;
    try {
      logger.info(`[CalendarListener] Simulating Google Calendar event generation for booking ${bookingId}`, {
        summary: `Therapy Session: ${booking.name}`,
        start: `${booking.date}T${booking.time}`,
        attendee: booking.email,
        therapistId: booking.therapistId
      });
    } catch (err) {
      logger.error(`[CalendarListener] Failed to schedule calendar event for booking ${bookingId}`, { error: err });
    }
  });

  eventBus.subscribe('BookingCancelled', async (event: any) => {
    const { bookingId } = event.payload;
    logger.info(`[CalendarListener] Simulating Google Calendar event cancellation for booking ${bookingId}`);
  });

  eventBus.subscribe('BookingRejected', async (event: any) => {
    const { bookingId } = event.payload;
    logger.info(`[CalendarListener] Simulating Google Calendar event cancellation/removal for booking ${bookingId}`);
  });
}
