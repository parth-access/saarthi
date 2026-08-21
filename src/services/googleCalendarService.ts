import { google } from 'googleapis';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { auditService } from '@/domains/audit/AuditService';
import { logger } from '@/app/api/_lib/logger';
import * as Sentry from '@sentry/nextjs';
import { SessionReminderService } from './sessionReminderService';

export interface CalendarEventResult {
  success: boolean;
  calendarEventId?: string;
  meetingUrl?: string;
  alreadyExists?: boolean;
  simulated?: boolean;
  error?: string;
}

export class GoogleCalendarService {
  private static getOAuth2Client() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    return oauth2Client;
  }

  static async createOrSyncCalendarEvent(bookingId: string): Promise<CalendarEventResult> {
    if (!bookingId) {
      return { success: false, error: 'Missing booking ID' };
    }

    try {
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking) {
        logger.error('CALENDAR', `Booking ${bookingId} not found when attempting calendar creation`);
        return { success: false, error: 'Booking not found' };
      }

      // Check if booking is in confirmed state
      if (booking.status !== 'confirmed') {
        logger.info('CALENDAR', `Skipping calendar creation for booking ${bookingId} with status ${booking.status}`);
        return { success: false, error: `Booking status is ${booking.status}, expected confirmed` };
      }

      // 1. IDEMPOTENCY CHECK
      if (booking.googleCalendarEventId && booking.meetingUrl) {
        logger.info('CALENDAR', `Calendar event already exists for booking ${bookingId}`, {
          eventId: booking.googleCalendarEventId,
          meetingUrl: booking.meetingUrl
        });
        return {
          success: true,
          calendarEventId: booking.googleCalendarEventId,
          meetingUrl: booking.meetingUrl,
          alreadyExists: true
        };
      }

      await auditService.logEvent(
        'CALENDAR_CREATION_STARTED',
        { bookingId, date: booking.date, time: booking.time },
        'system',
        bookingId
      );

      // Fetch Therapist details if available
      let therapistName = 'Saarthi Therapist';
      if (booking.therapistId) {
        try {
          const therapistSnap = await adminDb.collection('therapists').doc(booking.therapistId).get();
          if (therapistSnap.exists) {
            therapistName = therapistSnap.data()?.name || therapistName;
          }
        } catch (tErr) {
          logger.warn('CALENDAR', 'Could not fetch therapist details for event description', { error: String(tErr) });
        }
      }

      // Calculate start and end time in Asia/Kolkata
      const { startIso, endIso } = parseSessionTimeIST(booking.date, booking.time);

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'healwithsaarthi@gmail.com';
      const oauth2Client = this.getOAuth2Client();

      let calendarEventId: string;
      let meetingUrl: string;
      let isSimulated = false;

      if (!oauth2Client) {
        // Fallback / Simulated mode when Google API keys are not supplied in env
        logger.warn('CALENDAR', 'Google OAuth environment variables not set. Using simulated calendar event.', { bookingId });
        calendarEventId = `gcal_${bookingId}_${Date.now()}`;
        meetingUrl = `https://meet.google.com/saa-rthi-${bookingId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase()}`;
        isSimulated = true;
      } else {
        // Real Google Calendar API call
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const eventData = {
          summary: `Saarthi Session - ${booking.name}`,
          description: `Saarthi Therapy Session
Student: ${booking.name} (${booking.email}, Phone: ${booking.phone || 'N/A'})
Therapist: ${therapistName}
Booking ID: ${booking.id}
Session Type: ${booking.sessionType || 'Individual'}`,
          start: {
            dateTime: startIso,
            timeZone: 'Asia/Kolkata'
          },
          end: {
            dateTime: endIso,
            timeZone: 'Asia/Kolkata'
          },
          attendees: [
            { email: 'healwithsaarthi@gmail.com' },
            { email: booking.email }
          ],
          conferenceData: {
            createRequest: {
              requestId: `meet_${booking.id}`,
              conferenceSolutionKey: {
                type: 'hangoutsMeet'
              }
            }
          }
        };

        const response = await calendar.events.insert({
          calendarId,
          requestBody: eventData,
          conferenceDataVersion: 1
        });

        if (!response.data.id) {
          throw new Error('Google Calendar API returned response without event ID');
        }

        calendarEventId = response.data.id;
        meetingUrl = response.data.hangoutLink ||
          response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
          response.data.htmlLink ||
          `https://meet.google.com/saa-rthi-${bookingId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase()}`;
      }

      // Persist against the booking
      booking.googleCalendarEventId = calendarEventId;
      booking.meetingUrl = meetingUrl;
      booking.calendarStatus = 'CREATED';
      booking.calendarCreatedAt = FieldValue.serverTimestamp();
      booking.calendarError = undefined;

      await firestoreBookingRepository.save(booking);

      // Automatically schedule 5-hour session reminder once meeting URL is established
      try {
        await SessionReminderService.scheduleSessionReminder(bookingId);
      } catch (remErr) {
        logger.warn('REMINDER', `Failed to auto-schedule reminder after calendar creation for ${bookingId}`, { error: String(remErr) });
      }

      await auditService.logEvent(
        'CALENDAR_EVENT_CREATED',
        { bookingId, calendarEventId, meetingUrl, simulated: isSimulated },
        'system',
        bookingId
      );

      logger.success('CALENDAR', `Successfully created calendar event and Meet for booking ${bookingId}`, {
        calendarEventId,
        meetingUrl
      });

      return {
        success: true,
        calendarEventId,
        meetingUrl,
        simulated: isSimulated
      };

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('CALENDAR', `Failed to create Google Calendar event for booking ${bookingId}`, { error: errorMsg });

      try {
        Sentry.captureException(err, {
          tags: { operation: 'google_calendar_creation', bookingId }
        });
      } catch {
        // Ignore Sentry error
      }

      // Update booking with FAILED status without altering booking status or payment status
      try {
        const bookingToUpdate = await firestoreBookingRepository.findById(bookingId);
        if (bookingToUpdate) {
          bookingToUpdate.calendarStatus = 'FAILED';
          bookingToUpdate.calendarError = errorMsg;
          await firestoreBookingRepository.save(bookingToUpdate);
        }
      } catch (dbErr) {
        logger.error('CALENDAR', `Failed to record calendar failure status on booking ${bookingId}`, { error: String(dbErr) });
      }

      await auditService.logEvent(
        'CALENDAR_CREATION_FAILED',
        { bookingId, error: errorMsg },
        'system',
        bookingId
      );

      return {
        success: false,
        error: errorMsg
      };
    }
  }

  static async cancelCalendarEvent(bookingId: string): Promise<boolean> {
    try {
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking || !booking.googleCalendarEventId) {
        return false;
      }

      const oauth2Client = this.getOAuth2Client();
      if (!oauth2Client) {
        logger.info('CALENDAR', `Simulating calendar deletion for booking ${bookingId}`);
        return true;
      }

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'healwithsaarthi@gmail.com';
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      await calendar.events.delete({
        calendarId,
        eventId: booking.googleCalendarEventId
      });

      logger.info('CALENDAR', `Deleted calendar event ${booking.googleCalendarEventId} for booking ${bookingId}`);
      return true;
    } catch (err) {
      logger.warn('CALENDAR', `Failed to delete calendar event for booking ${bookingId}`, { error: String(err) });
      return false;
    }
  }
}

export function parseSessionTimeIST(dateStr: string, timeStr: string): { startIso: string; endIso: string } {
  try {
    let hours = 10;
    let minutes = 0;

    const trimmed = (timeStr || '').trim().toUpperCase();
    const isPm = trimmed.includes('PM');
    const isAm = trimmed.includes('AM');
    const cleanTime = trimmed.replace(/AM|PM/g, '').trim();
    const parts = cleanTime.split(':');

    if (parts.length >= 2) {
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);

      if (isPm && hours < 12) hours += 12;
      if (isAm && hours === 12) hours = 0;
    }

    const pad = (n: number) => n.toString().padStart(2, '0');
    const startStr = `${dateStr}T${pad(hours)}:${pad(minutes)}:00+05:30`;

    // Session duration 50 mins
    let endHours = hours;
    let endMinutes = minutes + 50;
    if (endMinutes >= 60) {
      endHours += Math.floor(endMinutes / 60);
      endMinutes = endMinutes % 60;
    }

    const endStr = `${dateStr}T${pad(endHours)}:${pad(endMinutes)}:00+05:30`;

    return { startIso: startStr, endIso: endStr };
  } catch {
    return {
      startIso: `${dateStr}T10:00:00+05:30`,
      endIso: `${dateStr}T10:50:00+05:30`
    };
  }
}
