import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { BookingStateMachine } from '@/domains/booking/state/BookingStateMachine';
import { OutboxService, OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { parseSessionTimeIST } from '@/services/googleCalendarService';
import { logger } from '@/app/api/_lib/logger';
import { Booking } from '@/types';

export interface LifecycleActor {
  uid: string;
  role: string;
}

export interface SessionLifecycleResult {
  success: boolean;
  bookingId: string;
  previousStatus?: string;
  newStatus?: string;
  alreadyInTargetStatus?: boolean;
  error?: string;
}

export interface AutoCompleteResult {
  scanned: number;
  completed: number;
  skipped: number;
  errors: string[];
}

export class SessionLifecycleService {
  /**
   * Completes a therapy session idempotently.
   */
  static async completeSession(
    bookingId: string,
    actor: LifecycleActor
  ): Promise<SessionLifecycleResult> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    const outboxEventId = generateDeterministicEventId('booking', bookingId, 'completed');
    let alreadyCompleted = false;
    let previousStatus = '';

    try {
      await adminDb.runTransaction(async (t) => {
        const booking = await firestoreBookingRepository.findById(bookingId, t);
        if (!booking) {
          throw new Error('Booking not found');
        }

        // Authorization check for therapists
        if (actor.role === 'therapist') {
          const therapistDoc = await t.get(adminDb.collection('therapists').doc(booking.therapistId));
          if (!therapistDoc.exists || (therapistDoc.data()?.authId !== actor.uid && therapistDoc.data()?.id !== actor.uid)) {
            throw new Error('Unauthorized to modify this session');
          }
        }

        if (booking.status === 'completed') {
          alreadyCompleted = true;
          previousStatus = 'completed';
          return;
        }

        if (booking.status !== 'confirmed' && booking.status !== 'rescheduled') {
          throw new Error(`Cannot complete booking with status '${booking.status}'. Only confirmed sessions can be completed.`);
        }

        previousStatus = booking.status;
        BookingStateMachine.transition(booking, 'completed', { skipEventBus: true });
        booking.updatedAt = FieldValue.serverTimestamp();
        await firestoreBookingRepository.save(booking, t);

        OutboxService.recordEventInTransaction(t, {
          id: outboxEventId,
          name: 'BookingCompleted',
          aggregateType: 'booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            booking: { ...booking },
            previousStatus,
            targetStatus: 'completed',
            metadata: {
              completedBy: actor.uid,
              role: actor.role,
              completedAt: new Date().toISOString()
            }
          }
        });

        const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
        t.set(auditRef, {
          action: 'session_completed',
          status: 'completed',
          timestamp: FieldValue.serverTimestamp(),
          details: `Session marked as completed by ${actor.role} (${actor.uid})`,
          userId: actor.uid
        });
      });

      if (!alreadyCompleted) {
        OutboxProcessor.processEvent(outboxEventId).catch((err) => {
          logger.error('LIFECYCLE', `Failed async processing of BookingCompleted event for ${bookingId}`, { error: String(err) });
        });
      }

      return {
        success: true,
        bookingId,
        previousStatus,
        newStatus: 'completed',
        alreadyInTargetStatus: alreadyCompleted
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('LIFECYCLE', `Failed to complete session ${bookingId}`, { error: errorMsg });
      return {
        success: false,
        bookingId,
        error: errorMsg
      };
    }
  }

  /**
   * Marks a session as no-show idempotently.
   */
  static async markNoShow(
    bookingId: string,
    actor: LifecycleActor,
    reason = 'Student / Client did not attend session'
  ): Promise<SessionLifecycleResult> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    const outboxEventId = generateDeterministicEventId('booking', bookingId, 'no_show');
    let alreadyNoShow = false;
    let previousStatus = '';

    try {
      await adminDb.runTransaction(async (t) => {
        const booking = await firestoreBookingRepository.findById(bookingId, t);
        if (!booking) {
          throw new Error('Booking not found');
        }

        // Authorization check for therapists
        if (actor.role === 'therapist') {
          const therapistDoc = await t.get(adminDb.collection('therapists').doc(booking.therapistId));
          if (!therapistDoc.exists || (therapistDoc.data()?.authId !== actor.uid && therapistDoc.data()?.id !== actor.uid)) {
            throw new Error('Unauthorized to modify this session');
          }
        }

        if (booking.status === 'no_show') {
          alreadyNoShow = true;
          previousStatus = 'no_show';
          return;
        }

        if (booking.status !== 'confirmed' && booking.status !== 'rescheduled') {
          throw new Error(`Cannot mark session with status '${booking.status}' as no-show. Only confirmed sessions can be marked no-show.`);
        }

        previousStatus = booking.status;
        BookingStateMachine.transition(booking, 'no_show', { skipEventBus: true });
        booking.declineReason = reason;
        booking.updatedAt = FieldValue.serverTimestamp();
        await firestoreBookingRepository.save(booking, t);

        OutboxService.recordEventInTransaction(t, {
          id: outboxEventId,
          name: 'BookingNoShow',
          aggregateType: 'booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            booking: { ...booking, declineReason: reason },
            previousStatus,
            targetStatus: 'no_show',
            reason,
            metadata: {
              markedBy: actor.uid,
              role: actor.role,
              markedAt: new Date().toISOString()
            }
          }
        });

        const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
        t.set(auditRef, {
          action: 'session_no_show',
          status: 'no_show',
          reason,
          timestamp: FieldValue.serverTimestamp(),
          details: `Session marked as no-show by ${actor.role} (${actor.uid}). Reason: ${reason}`,
          userId: actor.uid
        });
      });

      if (!alreadyNoShow) {
        OutboxProcessor.processEvent(outboxEventId).catch((err) => {
          logger.error('LIFECYCLE', `Failed async processing of BookingNoShow event for ${bookingId}`, { error: String(err) });
        });
      }

      return {
        success: true,
        bookingId,
        previousStatus,
        newStatus: 'no_show',
        alreadyInTargetStatus: alreadyNoShow
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('LIFECYCLE', `Failed to mark session as no-show ${bookingId}`, { error: errorMsg });
      return {
        success: false,
        bookingId,
        error: errorMsg
      };
    }
  }

  /**
   * Scans confirmed bookings and transitions concluded sessions to completed status.
   * Session conclusion is evaluated strictly in Asia/Kolkata (IST).
   */
  static async autoCompletePastSessions(): Promise<AutoCompleteResult> {
    if (!adminDb) {
      return { scanned: 0, completed: 0, skipped: 0, errors: ['Database is not initialized'] };
    }

    const now = Date.now();
    const result: AutoCompleteResult = {
      scanned: 0,
      completed: 0,
      skipped: 0,
      errors: []
    };

    try {
      const snapshot = await adminDb
        .collection('bookings')
        .where('status', '==', 'confirmed')
        .get();

      result.scanned = snapshot.size;

      for (const doc of snapshot.docs) {
        const booking = { id: doc.id, ...doc.data() } as Booking;
        if (!booking.date || !booking.time) {
          result.skipped++;
          continue;
        }

        try {
          const { endIso } = parseSessionTimeIST(booking.date, booking.time);
          const endTimeMillis = new Date(endIso).getTime();

          // If the session scheduled end time in IST is in the past, complete it
          if (endTimeMillis <= now) {
            const res = await this.completeSession(booking.id, {
              uid: 'system_auto_complete',
              role: 'system'
            });

            if (res.success) {
              result.completed++;
            } else {
              result.errors.push(`Failed for booking ${booking.id}: ${res.error}`);
            }
          } else {
            result.skipped++;
          }
        } catch (err) {
          result.errors.push(`Error parsing date/time for booking ${booking.id}: ${String(err)}`);
        }
      }

      logger.info('LIFECYCLE', `Auto-completion batch finished: ${result.completed} completed, ${result.skipped} skipped of ${result.scanned} scanned.`);
      return result;
    } catch (err) {
      logger.error('LIFECYCLE', 'Error running autoCompletePastSessions batch', { error: String(err) });
      result.errors.push(String(err));
      return result;
    }
  }
}
