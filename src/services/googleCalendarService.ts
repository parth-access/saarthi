import { google } from 'googleapis';
import { SESSION_DURATION_MINUTES } from '@/shared/constants';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { auditService } from '@/domains/audit/AuditService';
import { logger } from '@/app/api/_lib/logger';
import * as Sentry from '@sentry/nextjs';
import { SessionReminderService } from './sessionReminderService';
import { sendEmailAction } from '@/app/api/email/emailSender';
import type { Booking } from '@/domains/booking/entities/Booking';

/**
 * The Google account that owns / organizes every Saarthi session calendar event.
 * Events are inserted into THIS account's calendar, so it is always the organizer
 * and source calendar; therapist + client are attendees.
 */
const SAARTHI_ACCOUNT_EMAIL = 'healwithsaarthi@gmail.com';

export interface CalendarEventResult {
  success: boolean;
  calendarEventId?: string;
  meetingUrl?: string;
  alreadyExists?: boolean;
  /** True when the failure is transient and the operation should be retried later. */
  retryable?: boolean;
  error?: string;
}

interface TherapistContact {
  name: string;
  email?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleApiError = { code?: number; response?: { status?: number } } & Record<string, any>;

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

    // The refresh token was granted by SAARTHI_ACCOUNT_EMAIL; googleapis auto-refreshes
    // short-lived access tokens from it on every request.
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return oauth2Client;
  }

  /** Returns an authenticated Calendar v3 client, or null when credentials are absent. */
  private static getCalendarClient() {
    const oauth2Client = this.getOAuth2Client();
    if (!oauth2Client) return null;
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  private static getCalendarId(): string {
    return process.env.GOOGLE_CALENDAR_ID || SAARTHI_ACCOUNT_EMAIL;
  }

  /** Extract a REAL Google Meet URL. Never fabricates; returns undefined if absent. */
  private static extractMeetUrl(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any
  ): string | undefined {
    if (data?.hangoutLink) return data.hangoutLink as string;
    const video = data?.conferenceData?.entryPoints?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ep: any) => ep.entryPointType === 'video'
    );
    return video?.uri || undefined;
  }

  private static async fetchTherapistContact(therapistId?: string): Promise<TherapistContact> {
    if (!therapistId) return { name: 'Saarthi Therapist' };
    try {
      const snap = await adminDb.collection('therapists').doc(therapistId).get();
      if (snap.exists) {
        const d = snap.data();
        return { name: d?.name || 'Saarthi Therapist', email: d?.email };
      }
    } catch (tErr) {
      logger.warn('CALENDAR', 'Could not fetch therapist details for event', { error: String(tErr) });
    }
    return { name: 'Saarthi Therapist' };
  }

  /** Builds the shared event body (summary/description/start/end/attendees) used by insert + patch. */
  private static buildEventBody(booking: Booking, therapist: TherapistContact) {
    const { startIso, endIso } = parseSessionTimeIST(booking.date, booking.time);

    const attendees: Array<{ email: string }> = [
      { email: SAARTHI_ACCOUNT_EMAIL },
      { email: booking.email },
    ];
    if (therapist.email && therapist.email !== booking.email && therapist.email !== SAARTHI_ACCOUNT_EMAIL) {
      attendees.push({ email: therapist.email });
    }

    return {
      summary: `Saarthi Session - ${booking.name}`,
      description: `Saarthi Therapy Session
Student: ${booking.name} (${booking.email}, Phone: ${booking.phone || 'N/A'})
Therapist: ${therapist.name}
Booking ID: ${booking.id}
Session Type: ${booking.sessionType || 'Individual'}`,
      start: { dateTime: startIso, timeZone: 'Asia/Kolkata' },
      end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
      attendees,
    };
  }

  private static async markRetryRequired(booking: Booking, error: string): Promise<void> {
    booking.calendarStatus = 'RETRY_REQUIRED';
    booking.calendarError = error;
    // NOTE: we never write a meetingUrl here — failing closed is mandatory.
    await firestoreBookingRepository.save(booking);
  }

  /** Persist a successfully-created/recovered event, then notify the customer with the REAL link. */
  private static async finalizeCreated(booking: Booking, eventId: string, meetingUrl: string): Promise<void> {
    booking.googleCalendarEventId = eventId;
    booking.meetingUrl = meetingUrl;
    booking.calendarStatus = 'CREATED';
    booking.calendarCreatedAt = FieldValue.serverTimestamp();
    booking.calendarError = undefined;
    await firestoreBookingRepository.save(booking);

    // Schedule the 5-hour session reminder now that a real meeting URL exists.
    try {
      await SessionReminderService.scheduleSessionReminder(booking.id);
    } catch (remErr) {
      logger.warn('REMINDER', `Failed to auto-schedule reminder after calendar creation for ${booking.id}`, {
        error: String(remErr),
      });
    }

    // The confirmation email is sent HERE (not by EmailListener) so it always carries the real Meet link.
    try {
      await sendEmailAction({
        type: 'booking-confirmed',
        bookingId: booking.id,
        therapistId: booking.therapistId,
        meetingUrl,
        bookingDetails: {
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          date: booking.date,
          time: booking.time,
        },
      });
    } catch (emailErr) {
      // Email failure must not fail the calendar operation; the email has its own retry pipeline.
      logger.warn('CALENDAR', `Failed to send confirmation email after calendar creation for ${booking.id}`, {
        error: String(emailErr),
      });
    }
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

      if (booking.status !== 'confirmed') {
        logger.info('CALENDAR', `Skipping calendar creation for booking ${bookingId} with status ${booking.status}`);
        return { success: false, error: `Booking status is ${booking.status}, expected confirmed` };
      }

      // 1. IDEMPOTENCY: a real event + real link already exist.
      if (booking.googleCalendarEventId && booking.meetingUrl) {
        logger.info('CALENDAR', `Calendar event already exists for booking ${bookingId}`, {
          eventId: booking.googleCalendarEventId,
          meetingUrl: booking.meetingUrl,
        });
        return {
          success: true,
          calendarEventId: booking.googleCalendarEventId,
          meetingUrl: booking.meetingUrl,
          alreadyExists: true,
        };
      }

      // 2. FAIL CLOSED: no credentials => never fabricate a link, mark retryable, persist NO meetingUrl.
      const calendar = this.getCalendarClient();
      if (!calendar) {
        logger.error('CALENDAR', 'Google OAuth credentials not configured; cannot create a real Google Meet link', {
          bookingId,
        });
        await this.markRetryRequired(booking, 'Google Calendar credentials are not configured');
        await auditService.logEvent(
          'CALENDAR_CREATION_FAILED',
          { bookingId, error: 'credentials_missing' },
          'system',
          bookingId
        );
        return { success: false, retryable: true, error: 'Google Calendar credentials are not configured' };
      }

      const calendarId = this.getCalendarId();

      // 3. RECOVERY: an event was created previously but the Meet link wasn't captured.
      //    Fetch it via events.get — never re-insert (that would duplicate the event/meeting).
      if (booking.googleCalendarEventId && !booking.meetingUrl) {
        const got = await calendar.events.get({ calendarId, eventId: booking.googleCalendarEventId });
        const recoveredUrl = this.extractMeetUrl(got.data);
        if (!recoveredUrl) {
          await this.markRetryRequired(booking, 'Meet link not yet available on existing calendar event');
          return {
            success: false,
            retryable: true,
            calendarEventId: booking.googleCalendarEventId,
            error: 'Meet link not yet available',
          };
        }
        await this.finalizeCreated(booking, booking.googleCalendarEventId, recoveredUrl);
        return { success: true, calendarEventId: booking.googleCalendarEventId, meetingUrl: recoveredUrl };
      }

      await auditService.logEvent(
        'CALENDAR_CREATION_STARTED',
        { bookingId, date: booking.date, time: booking.time },
        'system',
        bookingId
      );

      const therapist = await this.fetchTherapistContact(booking.therapistId);

      // 4. Create the real event with a real Google Meet conference.
      const eventBody = {
        ...this.buildEventBody(booking, therapist),
        conferenceData: {
          createRequest: {
            requestId: `meet_${booking.id}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      };

      const response = await calendar.events.insert({
        calendarId,
        requestBody: eventBody,
        conferenceDataVersion: 1,
      });

      const eventId = response.data.id;
      if (!eventId) {
        throw new Error('Google Calendar API returned response without event ID');
      }

      const meetingUrl = this.extractMeetUrl(response.data);
      if (!meetingUrl) {
        // Event exists but no Meet link yet. Persist the eventId so the retry path recovers it
        // via events.get instead of inserting a duplicate. Never fabricate a link.
        booking.googleCalendarEventId = eventId;
        await this.markRetryRequired(booking, 'Calendar event created but Google Meet link is missing');
        await auditService.logEvent(
          'CALENDAR_CREATION_FAILED',
          { bookingId, calendarEventId: eventId, error: 'meet_link_missing' },
          'system',
          bookingId
        );
        return { success: false, retryable: true, calendarEventId: eventId, error: 'Meet link missing on created event' };
      }

      await this.finalizeCreated(booking, eventId, meetingUrl);

      await auditService.logEvent(
        'CALENDAR_EVENT_CREATED',
        { bookingId, calendarEventId: eventId, meetingUrl },
        'system',
        bookingId
      );
      logger.success('CALENDAR', `Successfully created calendar event and Meet for booking ${bookingId}`, {
        calendarEventId: eventId,
        meetingUrl,
      });

      return { success: true, calendarEventId: eventId, meetingUrl };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('CALENDAR', `Failed to create Google Calendar event for booking ${bookingId}`, { error: errorMsg });

      try {
        Sentry.captureException(err, { tags: { operation: 'google_calendar_creation', bookingId } });
      } catch {
        // ignore Sentry error
      }

      // Record a retryable FAILED status WITHOUT touching booking/payment status and WITHOUT a fake link.
      try {
        const bookingToUpdate = await firestoreBookingRepository.findById(bookingId);
        if (bookingToUpdate) {
          bookingToUpdate.calendarStatus = 'FAILED';
          bookingToUpdate.calendarError = errorMsg;
          await firestoreBookingRepository.save(bookingToUpdate);
        }
      } catch (dbErr) {
        logger.error('CALENDAR', `Failed to record calendar failure status on booking ${bookingId}`, {
          error: String(dbErr),
        });
      }

      await auditService.logEvent('CALENDAR_CREATION_FAILED', { bookingId, error: errorMsg }, 'system', bookingId);

      return { success: false, retryable: true, error: errorMsg };
    }
  }

  /**
   * Update an existing calendar event to the booking's current date/time (reschedule).
   * Patches the SAME event so the Google Meet link is preserved; never creates a duplicate.
   * Falls back to creation if no event exists yet. Idempotent.
   */
  static async updateCalendarEvent(bookingId: string): Promise<CalendarEventResult> {
    if (!bookingId) {
      return { success: false, error: 'Missing booking ID' };
    }

    try {
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking) {
        logger.error('CALENDAR', `Booking ${bookingId} not found when attempting calendar update`);
        return { success: false, error: 'Booking not found' };
      }

      if (booking.status === 'cancelled' || booking.status === 'rejected') {
        logger.info('CALENDAR', `Skipping calendar update for ${booking.status} booking ${bookingId}`);
        return { success: false, error: `Booking is ${booking.status}` };
      }

      // No event yet (e.g. calendar creation still pending) -> create it now instead of patching.
      if (!booking.googleCalendarEventId) {
        logger.info('CALENDAR', `No existing calendar event for booking ${bookingId}; creating instead of patching`);
        return this.createOrSyncCalendarEvent(bookingId);
      }

      const calendar = this.getCalendarClient();
      if (!calendar) {
        logger.error('CALENDAR', 'Google OAuth credentials not configured; cannot update calendar event', { bookingId });
        await this.markRetryRequired(booking, 'Google Calendar credentials are not configured');
        return { success: false, retryable: true, error: 'Google Calendar credentials are not configured' };
      }

      const calendarId = this.getCalendarId();
      const therapist = await this.fetchTherapistContact(booking.therapistId);

      // booking.date/time already reflect the NEW slot (set by RescheduleBookingCommand).
      const response = await calendar.events.patch({
        calendarId,
        eventId: booking.googleCalendarEventId,
        requestBody: this.buildEventBody(booking, therapist),
        conferenceDataVersion: 1,
      });

      // The Meet link is preserved across a patch; capture it if returned, else keep the stored one.
      const meetingUrl = this.extractMeetUrl(response.data) || booking.meetingUrl;
      booking.meetingUrl = meetingUrl;
      booking.calendarStatus = 'CREATED';
      booking.calendarError = undefined;
      await firestoreBookingRepository.save(booking);

      await auditService.logEvent(
        'CALENDAR_EVENT_UPDATED',
        { bookingId, calendarEventId: booking.googleCalendarEventId, date: booking.date, time: booking.time },
        'system',
        bookingId
      );
      logger.success('CALENDAR', `Updated calendar event for booking ${bookingId}`, {
        eventId: booking.googleCalendarEventId,
      });

      // The stored reminder time is now stale; re-schedule against the new slot.
      try {
        await SessionReminderService.scheduleSessionReminder(bookingId);
      } catch (remErr) {
        logger.warn('REMINDER', `Failed to reschedule reminder after calendar update for ${bookingId}`, {
          error: String(remErr),
        });
      }

      // Notify the customer (and therapist) of the new time, keeping the same Meet link.
      try {
        await sendEmailAction({
          type: 'booking-rescheduled',
          bookingId,
          therapistId: booking.therapistId,
          meetingUrl: meetingUrl || undefined,
          bookingDetails: {
            name: booking.name,
            email: booking.email,
            phone: booking.phone,
            date: booking.date,
            time: booking.time,
            originalDate: booking.originalDate,
            originalTime: booking.originalTime,
          },
        });
      } catch (emailErr) {
        logger.warn('CALENDAR', `Failed to send reschedule email for ${bookingId}`, { error: String(emailErr) });
      }

      return { success: true, calendarEventId: booking.googleCalendarEventId, meetingUrl: meetingUrl || undefined };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('CALENDAR', `Failed to update calendar event for booking ${bookingId}`, { error: errorMsg });

      try {
        Sentry.captureException(err, { tags: { operation: 'google_calendar_update', bookingId } });
      } catch {
        // ignore Sentry error
      }

      try {
        const b = await firestoreBookingRepository.findById(bookingId);
        if (b) {
          b.calendarStatus = 'RETRY_REQUIRED';
          b.calendarError = errorMsg;
          await firestoreBookingRepository.save(b);
        }
      } catch {
        // ignore
      }

      return { success: false, retryable: true, error: errorMsg };
    }
  }

  /**
   * Cancel/remove the calendar event for a booking. Idempotent:
   *  - no stored event    -> success no-op (state marked CANCELLED)
   *  - credentials missing -> false (retryable; does NOT claim success)
   *  - 404/410 from Google -> treated as already-cancelled success
   * On success the stored calendar fields are cleared so state reflects "inactive".
   */
  static async cancelCalendarEvent(bookingId: string): Promise<boolean> {
    try {
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking) {
        logger.info('CALENDAR', `No booking ${bookingId} found to cancel calendar for; treating as no-op`);
        return true;
      }

      if (!booking.googleCalendarEventId) {
        // Nothing scheduled -> idempotent success. Reflect cancelled state.
        if (booking.calendarStatus !== 'CANCELLED') {
          booking.calendarStatus = 'CANCELLED';
          await firestoreBookingRepository.save(booking);
        }
        return true;
      }

      const calendar = this.getCalendarClient();
      if (!calendar) {
        logger.warn('CALENDAR', `Cannot delete calendar event for ${bookingId}: credentials not configured`, {
          bookingId,
        });
        return false; // retryable — never claim a fake success
      }

      const calendarId = this.getCalendarId();
      const eventId = booking.googleCalendarEventId;

      try {
        await calendar.events.delete({ calendarId, eventId });
      } catch (delErr) {
        const status = (delErr as GoogleApiError)?.code ?? (delErr as GoogleApiError)?.response?.status;
        if (status === 404 || status === 410) {
          logger.info('CALENDAR', `Calendar event ${eventId} already absent (status ${status}); treating as cancelled`, {
            bookingId,
          });
        } else {
          throw delErr;
        }
      }

      // Clear stored calendar state reliably (FieldValue.delete, since undefined is stripped on merge).
      await adminDb.collection('bookings').doc(bookingId).update({
        googleCalendarEventId: FieldValue.delete(),
        meetingUrl: FieldValue.delete(),
        calendarStatus: 'CANCELLED',
        calendarError: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      logger.info('CALENDAR', `Cancelled calendar event ${eventId} for booking ${bookingId}`);
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

    // Session duration — the shared SESSION_DURATION_MINUTES (45), so the
    // calendar event length and every displayed "start–end" range stay in sync.
    const endTotal = hours * 60 + minutes + SESSION_DURATION_MINUTES;
    const endHours = Math.floor(endTotal / 60) % 24;
    const endMinutes = endTotal % 60;

    const endStr = `${dateStr}T${pad(endHours)}:${pad(endMinutes)}:00+05:30`;

    return { startIso: startStr, endIso: endStr };
  } catch {
    return {
      startIso: `${dateStr}T10:00:00+05:30`,
      endIso: `${dateStr}T10:45:00+05:30`,
    };
  }
}
