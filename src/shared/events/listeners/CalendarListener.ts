/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/shared/logger';
import { GoogleCalendarService } from '@/services/googleCalendarService';

export function registerCalendarListeners(eventBus: any) {
  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      logger.info(`[CalendarListener] Triggering Google Calendar & Meet integration for booking ${bookingId}`);
      const result = await GoogleCalendarService.createOrSyncCalendarEvent(bookingId);
      if (!result.success) {
        logger.warn(`[CalendarListener] Calendar integration returned failure for booking ${bookingId}: ${result.error}`);
      }
    } catch (err) {
      logger.error(`[CalendarListener] Exception during Google Calendar event creation for booking ${bookingId}`, { error: err });
    }
  });

  eventBus.subscribe('BookingRescheduled', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      logger.info(`[CalendarListener] Updating Google Calendar event for rescheduled booking ${bookingId}`);
      const result = await GoogleCalendarService.updateCalendarEvent(bookingId);
      if (!result.success) {
        logger.warn(`[CalendarListener] Calendar update returned failure for booking ${bookingId}: ${result.error}`);
      }
    } catch (err) {
      logger.error(`[CalendarListener] Exception during Google Calendar event update for booking ${bookingId}`, { error: err });
    }
  });

  eventBus.subscribe('BookingCancelled', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      logger.info(`[CalendarListener] Cancelling Google Calendar event for booking ${bookingId}`);
      await GoogleCalendarService.cancelCalendarEvent(bookingId);
    } catch (err) {
      logger.error(`[CalendarListener] Exception during Google Calendar event cancellation for booking ${bookingId}`, { error: err });
    }
  });

  eventBus.subscribe('BookingRejected', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      logger.info(`[CalendarListener] Cancelling Google Calendar event for rejected booking ${bookingId}`);
      await GoogleCalendarService.cancelCalendarEvent(bookingId);
    } catch (err) {
      logger.error(`[CalendarListener] Exception during Google Calendar event removal for rejected booking ${bookingId}`, { error: err });
    }
  });
}
