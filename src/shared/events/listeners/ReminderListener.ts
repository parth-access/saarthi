/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from '@/shared/logger';
import { SessionReminderService } from '@/services/sessionReminderService';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { auditService } from '@/domains/audit/AuditService';

export function registerReminderListeners(eventBus: any) {
  // When a booking is confirmed, schedule the 30-minute session reminder outbox event
  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      logger.info(`[ReminderListener] Scheduling 30-minute session reminder for booking ${bookingId}`);
      await SessionReminderService.scheduleSessionReminder(bookingId);
    } catch (err) {
      logger.error(`[ReminderListener] Failed to schedule session reminder for booking ${bookingId}`, { error: String(err) });
    }
  });

  // When outbox triggers the scheduled SendSessionReminder event
  eventBus.subscribe('SendSessionReminder', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      logger.info(`[ReminderListener] Executing SendSessionReminder event for booking ${bookingId}`);
      const result = await SessionReminderService.sendSessionReminder(bookingId);
      if (!result.success && !result.alreadySent) {
        logger.warn(`[ReminderListener] SendSessionReminder returned failure for booking ${bookingId}: ${result.error || result.skippedReason}`);
      }
    } catch (err) {
      logger.error(`[ReminderListener] Exception during SendSessionReminder execution for booking ${bookingId}`, { error: String(err) });
    }
  });

  // When a booking is cancelled or rejected, cancel/skip any pending session reminder
  eventBus.subscribe('BookingCancelled', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      if (!adminDb) return;
      const docRef = adminDb.collection('bookings').doc(bookingId);
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (data?.reminderStatus === 'PENDING') {
          await docRef.update({
            reminderStatus: 'SKIPPED',
            updatedAt: FieldValue.serverTimestamp()
          });
          await auditService.logEvent('REMINDER_SKIPPED', { reason: 'booking_cancelled', bookingId }, 'system', bookingId);
          logger.info(`[ReminderListener] Cancelled pending reminder for cancelled booking ${bookingId}`);
        }
      }
    } catch (err) {
      logger.error(`[ReminderListener] Error skipping reminder on booking cancellation for ${bookingId}`, { error: String(err) });
    }
  });

  eventBus.subscribe('BookingRejected', async (event: any) => {
    const { bookingId } = event.payload;
    try {
      if (!adminDb) return;
      const docRef = adminDb.collection('bookings').doc(bookingId);
      const snap = await docRef.get();
      if (snap.exists) {
        const data = snap.data();
        if (data?.reminderStatus === 'PENDING') {
          await docRef.update({
            reminderStatus: 'SKIPPED',
            updatedAt: FieldValue.serverTimestamp()
          });
          await auditService.logEvent('REMINDER_SKIPPED', { reason: 'booking_rejected', bookingId }, 'system', bookingId);
          logger.info(`[ReminderListener] Cancelled pending reminder for rejected booking ${bookingId}`);
        }
      }
    } catch (err) {
      logger.error(`[ReminderListener] Error skipping reminder on booking rejection for ${bookingId}`, { error: String(err) });
    }
  });
}
