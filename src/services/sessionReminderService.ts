import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/app/api/_lib/logger';
import { auditService } from '@/domains/audit/AuditService';
import { OutboxService, generateDeterministicEventId } from '@/shared/events/outbox';
import { sendEmailAction } from '@/app/api/email/emailSender';
import { parseSessionTimeIST } from './googleCalendarService';
import { Booking } from '@/types';

export interface ReminderCalculation {
  sessionStartTimeMillis: number;
  sessionEndTimeMillis: number;
  reminderTimeMillis: number;
  sessionStartIso: string;
  sessionEndIso: string;
  reminderIso: string;
  isSessionPast: boolean;
  isReminderDue: boolean;
  isLateForReminder: boolean;
}

export interface SendReminderResult {
  success: boolean;
  alreadySent?: boolean;
  studentSent?: boolean;
  therapistSent?: boolean;
  skippedReason?: string;
  error?: string;
}

export class SessionReminderService {
  /**
   * Precise calculation of the 30-minute reminder timestamp in Asia/Kolkata (+05:30).
   */
  static calculateReminderTimeIST(dateStr: string, timeStr: string): ReminderCalculation {
    const { startIso, endIso } = parseSessionTimeIST(dateStr, timeStr);
    const sessionStartTimeMillis = new Date(startIso).getTime();
    const sessionEndTimeMillis = new Date(endIso).getTime();
    
    // Exactly 30 minutes prior to session start
    const reminderTimeMillis = sessionStartTimeMillis - (30 * 60 * 1000);
    const reminderIso = new Date(reminderTimeMillis).toISOString();

    const now = Date.now();
    const isSessionPast = now >= sessionStartTimeMillis;
    const isReminderDue = now >= reminderTimeMillis;
    // Considered late if we are more than 15 minutes past the scheduled reminder time
    const isLateForReminder = now > (reminderTimeMillis + (15 * 60 * 1000));

    return {
      sessionStartTimeMillis,
      sessionEndTimeMillis,
      reminderTimeMillis,
      sessionStartIso: startIso,
      sessionEndIso: endIso,
      reminderIso,
      isSessionPast,
      isReminderDue,
      isLateForReminder
    };
  }

  /**
   * Schedules a reminder event in the durable outbox when a booking is confirmed.
   */
  static async scheduleSessionReminder(bookingId: string): Promise<{ scheduled: boolean; reason?: string; reminderTime?: string }> {
    if (!adminDb) {
      logger.warn('REMINDER', 'adminDb not initialized, cannot schedule reminder', { bookingId });
      return { scheduled: false, reason: 'adminDb not initialized' };
    }

    try {
      const docRef = adminDb.collection('bookings').doc(bookingId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        logger.warn('REMINDER', `Booking ${bookingId} not found when attempting to schedule reminder`);
        return { scheduled: false, reason: 'booking_not_found' };
      }

      const booking = docSnap.data() as Booking;

      if (booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') {
        logger.info('REMINDER', `Booking ${bookingId} is not confirmed/paid (${booking.status}/${booking.paymentStatus}). Skipping schedule.`);
        return { scheduled: false, reason: 'not_confirmed_or_paid' };
      }

      const calculation = this.calculateReminderTimeIST(booking.date, booking.time);
      const now = Date.now();

      // If session is already in the past, mark skipped
      if (calculation.isSessionPast) {
        await docRef.update({
          reminderStatus: 'SKIPPED',
          updatedAt: FieldValue.serverTimestamp()
        });
        await auditService.logEvent('REMINDER_SKIPPED', { reason: 'session_in_past', bookingId }, booking.userId || 'system', bookingId);
        logger.info('REMINDER', `Booking ${bookingId} session is in the past. Marked reminder as SKIPPED.`);
        return { scheduled: false, reason: 'session_in_past' };
      }

      // If confirmation occurred after the 30-minute mark (less than 30 minutes before session)
      if (now >= calculation.reminderTimeMillis) {
        // If we are within a reasonable grace window (within 15 minutes of the 30-minute mark) and session is still upcoming,
        // we can enqueue immediately; otherwise, skip sending a stale "30 minutes before" notification.
        const isWithinGrace = now <= (calculation.reminderTimeMillis + (15 * 60 * 1000));
        
        if (!isWithinGrace) {
          await docRef.update({
            reminderStatus: 'SKIPPED',
            updatedAt: FieldValue.serverTimestamp()
          });
          await auditService.logEvent('REMINDER_SKIPPED', { reason: 'late_confirmation_skipped', bookingId }, booking.userId || 'system', bookingId);
          logger.info('REMINDER', `Booking ${bookingId} was confirmed late (less than 15 minutes before session). Skipped 30-minute reminder.`);
          return { scheduled: false, reason: 'late_confirmation_skipped' };
        }
      }

      // Enqueue durable outbox event with nextAttemptAt set to the 30-minute reminder timestamp
      const nextAttemptDate = new Date(Math.max(Date.now(), calculation.reminderTimeMillis));
      const eventId = generateDeterministicEventId('booking', bookingId, 'session_reminder');

      await OutboxService.recordEvent({
        id: eventId,
        name: 'SendSessionReminder',
        aggregateType: 'booking',
        aggregateId: bookingId,
        nextAttemptAt: nextAttemptDate,
        payload: {
          bookingId,
          reminderTimeIso: calculation.reminderIso,
          sessionStartIso: calculation.sessionStartIso
        }
      });

      await docRef.update({
        reminderStatus: 'PENDING',
        reminderScheduledFor: nextAttemptDate,
        updatedAt: FieldValue.serverTimestamp()
      });

      await auditService.logEvent(
        'REMINDER_SCHEDULED', 
        { 
          scheduledFor: calculation.reminderIso, 
          sessionStart: calculation.sessionStartIso 
        }, 
        booking.userId || 'system', 
        bookingId
      );

      logger.info('REMINDER', `Scheduled 30-minute session reminder for booking ${bookingId} at ${calculation.reminderIso}`);
      return { scheduled: true, reminderTime: calculation.reminderIso };
    } catch (err) {
      logger.error('REMINDER', `Failed to schedule reminder for booking ${bookingId}`, err);
      return { scheduled: false, reason: String(err) };
    }
  }

  /**
   * Idempotently sends the 30-minute reminder email to student and psychologist.
   */
  static async sendSessionReminder(bookingId: string, options?: { force?: boolean }): Promise<SendReminderResult> {
    if (!adminDb) {
      return { success: false, error: 'adminDb not initialized' };
    }

    const docRef = adminDb.collection('bookings').doc(bookingId);

    try {
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return { success: false, error: `Booking ${bookingId} not found` };
      }

      const booking = docSnap.data() as Booking;

      // 1. Validate status
      if (booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') {
        logger.warn('REMINDER', `Booking ${bookingId} is not in confirmed & paid state (${booking.status}/${booking.paymentStatus}). Aborting reminder.`);
        return { success: false, skippedReason: `Invalid booking state: ${booking.status}/${booking.paymentStatus}` };
      }

      // 2. Idempotency check: Already sent?
      if (booking.reminderStatus === 'SENT' && !options?.force) {
        logger.info('REMINDER', `Reminder for booking ${bookingId} was already sent. Skipping duplicate.`, { reminderSentAt: booking.reminderSentAt });
        return { success: true, alreadySent: true };
      }

      // 3. Validate Google Meet URL
      if (!booking.meetingUrl) {
        const errMsg = `Meeting URL is not available for booking ${bookingId}. Reminder cannot be dispatched.`;
        logger.error('REMINDER', errMsg, { calendarStatus: booking.calendarStatus });

        await docRef.update({
          reminderStatus: 'FAILED',
          reminderError: 'Missing meeting URL',
          updatedAt: FieldValue.serverTimestamp()
        });

        await auditService.logEvent('REMINDER_FAILED', { error: 'Missing meeting URL', bookingId }, booking.userId || 'system', bookingId);
        return { success: false, error: errMsg };
      }

      // 4. Validate Timing
      const calculation = this.calculateReminderTimeIST(booking.date, booking.time);

      if (calculation.isSessionPast && !options?.force) {
        logger.warn('REMINDER', `Session for booking ${bookingId} has already started or passed. Skipping reminder.`);
        await docRef.update({
          reminderStatus: 'SKIPPED',
          updatedAt: FieldValue.serverTimestamp()
        });
        await auditService.logEvent('REMINDER_SKIPPED', { reason: 'session_passed', bookingId }, booking.userId || 'system', bookingId);
        return { success: false, skippedReason: 'Session has already started or passed' };
      }

      if (calculation.isLateForReminder && !options?.force) {
        logger.warn('REMINDER', `Reminder execution is more than 2 hours past scheduled time for booking ${bookingId}. Skipping.`);
        await docRef.update({
          reminderStatus: 'SKIPPED',
          updatedAt: FieldValue.serverTimestamp()
        });
        await auditService.logEvent('REMINDER_SKIPPED', { reason: 'reminder_window_passed', bookingId }, booking.userId || 'system', bookingId);
        return { success: false, skippedReason: '30-minute reminder window has expired' };
      }

      // 5. Dispatch reminder emails
      logger.info('REMINDER', `Dispatching 30-minute reminder emails for booking ${bookingId} with meeting URL: ${booking.meetingUrl}`);

      const emailResult = await sendEmailAction({
        type: 'session-reminder',
        bookingId,
        therapistId: booking.therapistId,
        meetingUrl: booking.meetingUrl,
        bookingDetails: {
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          date: booking.date,
          time: booking.time,
          sessionMode: booking.sessionMode,
          bookingToken: booking.bookingToken,
          meetingUrl: booking.meetingUrl,
          sessionType: booking.sessionType,
        }
      });

      // 6. Update database state idempotently
      await docRef.update({
        reminderStatus: 'SENT',
        reminderSentAt: FieldValue.serverTimestamp(),
        studentReminderSentAt: FieldValue.serverTimestamp(),
        therapistReminderSentAt: emailResult?.therapistSent ? FieldValue.serverTimestamp() : null,
        reminderError: null,
        updatedAt: FieldValue.serverTimestamp()
      });

      await auditService.logEvent(
        'REMINDER_SENT',
        {
          studentEmail: booking.email,
          therapistSent: !!emailResult?.therapistSent,
          meetingUrl: booking.meetingUrl
        },
        booking.userId || 'system',
        bookingId
      );

      // Write sub-collection audit log
      const subAuditRef = docRef.collection('audit_logs').doc();
      await subAuditRef.set({
        action: 'reminder_sent',
        timestamp: FieldValue.serverTimestamp(),
        details: '30-minute session reminder email sent successfully to student and psychologist.'
      });

      logger.success('REMINDER', `Successfully dispatched 30-minute reminder for booking ${bookingId}`);
      return {
        success: true,
        studentSent: true,
        therapistSent: !!emailResult?.therapistSent
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('REMINDER', `Failed to send 30-minute session reminder for booking ${bookingId}`, err);

      try {
        await docRef.update({
          reminderStatus: 'FAILED',
          reminderError: errorMsg,
          updatedAt: FieldValue.serverTimestamp()
        });

        await auditService.logEvent('REMINDER_FAILED', { error: errorMsg, bookingId }, 'system', bookingId);
      } catch (updateErr) {
        logger.error('REMINDER', 'Failed to update reminder failure status in DB', updateErr);
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Scans and processes all confirmed bookings that are currently due for their 30-minute reminder.
   */
  static async processDueReminders(limit: number = 20): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
    if (!adminDb) {
      return { processed: 0, sent: 0, skipped: 0, failed: 0 };
    }

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const now = Date.now();
      const snapshot = await adminDb.collection('bookings')
        .where('status', '==', 'confirmed')
        .where('paymentStatus', '==', 'paid')
        .limit(limit)
        .get();

      for (const doc of snapshot.docs) {
        const booking = doc.data() as Booking;

        // Skip if reminder has already been successfully sent or skipped
        if (booking.reminderStatus === 'SENT' || booking.reminderStatus === 'SKIPPED' || booking.reminderSentAt) {
          continue;
        }

        const calculation = this.calculateReminderTimeIST(booking.date, booking.time);

        // Check if reminder is due (now >= reminderTime) and session is still upcoming
        if (now >= calculation.reminderTimeMillis && now < calculation.sessionStartTimeMillis) {
          processed++;
          const result = await this.sendSessionReminder(doc.id);
          if (result.success && !result.alreadySent) {
            sent++;
          } else if (result.skippedReason) {
            skipped++;
          } else if (!result.success) {
            failed++;
          }
        }
      }
    } catch (err) {
      logger.error('REMINDER', 'Error during processDueReminders batch run', err);
    }

    return { processed, sent, skipped, failed };
  }
}
