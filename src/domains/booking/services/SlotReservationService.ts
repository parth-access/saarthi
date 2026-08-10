import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from '@/shared/logger';
import crypto from 'crypto';

export interface LockResult {
  success: boolean;
  lockId?: string;
  expiresAt?: Date;
  error?: string;
}

export class SlotReservationService {
  /**
   * Generates a standard document ID for a therapist's slot
   */
  static getSlotId(therapistId: string, date: string, time: string): string {
    return `${therapistId}_${date}_${time}`.replace(/\//g, '-');
  }

  /**
   * Acquires a transaction-safe lock for a specific slot.
   * Fails if the slot is already locked by another user (unless expired) or is booked.
   */
  static async acquireLock(
    therapistId: string,
    date: string,
    time: string,
    userId: string,
    durationMinutes: number = 5,
    customLockId?: string
  ): Promise<LockResult> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const slotId = this.getSlotId(therapistId, date, time);
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    try {
      return await adminDb.runTransaction(async (t) => {
        const doc = await t.get(slotRef);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationMinutes * 60000);
        const lockId = customLockId || crypto.randomUUID();

        if (doc.exists) {
          const data = doc.data() || {};
          let isExpired = false;

          if (data.expiresAt) {
            const expiresDate = typeof data.expiresAt.toDate === 'function' 
              ? data.expiresAt.toDate() 
              : new Date(data.expiresAt);
            if (expiresDate < now) {
              isExpired = true;
            }
          }

          if (data.bookingId) {
            return {
              success: false,
              error: 'Slot is already booked and confirmed',
            };
          }

          if (!isExpired) {
            if (data.userId === userId && data.lockId === customLockId) {
              t.update(slotRef, {
                expiresAt: Timestamp.fromDate(expiresAt),
                updatedAt: FieldValue.serverTimestamp(),
              });
              return { success: true, lockId: data.lockId, expiresAt };
            } else {
              return {
                success: false,
                error: 'Slot is currently reserved by another user',
              };
            }
          } else {
            t.delete(slotRef);
          }
        }

        t.set(slotRef, {
          lockId,
          therapistId,
          date,
          time,
          userId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAt),
        });

        const auditRef = adminDb.collection('audit_logs').doc();
        t.set(auditRef, {
          eventType: 'LOCK_ACQUIRED',
          therapistId,
          date,
          time,
          userId,
          lockId,
          expiresAt: Timestamp.fromDate(expiresAt),
          timestamp: FieldValue.serverTimestamp(),
          details: `Lock acquired for therapist ${therapistId} on ${date} at ${time}`,
        });

        return {
          success: true,
          lockId,
          expiresAt,
        };
      });
    } catch (err) {
      logger.error('Failed to acquire slot lock in transaction', { error: err, therapistId, date, time, userId });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to acquire slot lock',
      };
    }
  }

  /**
   * Explicitly releases/deletes a slot lock in a transaction.
   */
  static async releaseLock(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    userId?: string
  ): Promise<boolean> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const slotId = this.getSlotId(therapistId, date, time);
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    try {
      return await adminDb.runTransaction(async (t) => {
        const doc = await t.get(slotRef);
        if (!doc.exists) return false;

        const data = doc.data() || {};
        
        // Cannot release if there is a completed booking associated with it
        if (data.bookingId) {
          return false;
        }

        // Must match the lockId and optionally the userId
        if (data.lockId !== lockId || (userId && data.userId !== userId)) {
          return false;
        }

        t.delete(slotRef);

        const auditRef = adminDb.collection('audit_logs').doc();
        t.set(auditRef, {
          eventType: 'LOCK_RELEASED',
          therapistId,
          date,
          time,
          userId: data.userId || userId,
          lockId,
          timestamp: FieldValue.serverTimestamp(),
          details: `Lock released for therapist ${therapistId} on ${date} at ${time}`,
        });

        return true;
      });
    } catch (err) {
      logger.error('Failed to release slot lock in transaction', { error: err, therapistId, date, time, lockId });
      return false;
    }
  }

  /**
   * Extends an active lock's expiration time.
   */
  static async extendLock(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    durationMinutes: number = 5
  ): Promise<boolean> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const slotId = this.getSlotId(therapistId, date, time);
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    try {
      return await adminDb.runTransaction(async (t) => {
        const doc = await t.get(slotRef);
        if (!doc.exists) return false;

        const data = doc.data() || {};
        if (data.lockId !== lockId || data.bookingId) {
          return false;
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationMinutes * 60000);

        t.update(slotRef, {
          expiresAt: Timestamp.fromDate(expiresAt),
          updatedAt: FieldValue.serverTimestamp(),
        });

        const auditRef = adminDb.collection('audit_logs').doc();
        t.set(auditRef, {
          eventType: 'LOCK_EXTENDED',
          therapistId,
          date,
          time,
          userId: data.userId,
          lockId,
          expiresAt: Timestamp.fromDate(expiresAt),
          timestamp: FieldValue.serverTimestamp(),
          details: `Lock extended by ${durationMinutes} minutes for therapist ${therapistId} on ${date} at ${time}`,
        });

        return true;
      });
    } catch (err) {
      logger.error('Failed to extend slot lock in transaction', { error: err, therapistId, date, time, lockId });
      return false;
    }
  }

  /**
   * Recovers/verifies a lock to allow refreshing page/reconnecting.
   */
  static async recoverLock(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    userId: string
  ): Promise<LockResult> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const slotId = this.getSlotId(therapistId, date, time);
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    try {
      const doc = await slotRef.get();
      if (!doc.exists) {
        return { success: false, error: 'Lock does not exist' };
      }

      const data = doc.data() || {};
      if (data.lockId !== lockId || data.userId !== userId) {
        return { success: false, error: 'Lock credentials mismatch' };
      }

      if (data.bookingId) {
        return { success: false, error: 'Slot already booked' };
      }

      const expiresDate = typeof data.expiresAt.toDate === 'function' 
        ? data.expiresAt.toDate() 
        : new Date(data.expiresAt);
      
      if (expiresDate < new Date()) {
        return { success: false, error: 'Lock expired' };
      }

      return {
        success: true,
        lockId,
        expiresAt: expiresDate,
      };
    } catch (err) {
      logger.error('Failed to recover lock', { error: err, therapistId, date, time, lockId, userId });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to recover lock',
      };
    }
  }

  /**
   * Explicitly expires/cancels a slot lock, emitting events and updating associated awaiting_payment bookings.
   */
  static async expireLock(
    therapistId: string,
    date: string,
    time: string,
    lockId: string
  ): Promise<boolean> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const slotId = this.getSlotId(therapistId, date, time);
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    try {
      return await adminDb.runTransaction(async (t) => {
        const doc = await t.get(slotRef);
        if (!doc.exists) return false;

        const data = doc.data() || {};
        if (data.lockId !== lockId) return false;

        // If there's a booking associated, but it's not confirmed yet, we can mark it expired
        if (data.bookingId) {
          const bookingRef = adminDb.collection('bookings').doc(data.bookingId);
          const bookingDoc = await t.get(bookingRef);
          if (bookingDoc.exists) {
            const bookingData = bookingDoc.data() || {};
            // If booking is not yet confirmed/completed/cancelled, transition to cancelled/expired
            if (bookingData.status === 'awaiting_payment' || bookingData.status === 'pending') {
              t.update(bookingRef, {
                status: 'cancelled',
                declineReason: 'Payment timeout: Slot lock expired',
                updatedAt: FieldValue.serverTimestamp(),
              });

              // Add audit log for booking expired
              const bookingAuditRef = bookingRef.collection('audit_logs').doc();
              t.set(bookingAuditRef, {
                action: 'expired',
                timestamp: FieldValue.serverTimestamp(),
                details: 'Booking cancelled due to slot lock timeout and payment lack of completion',
                userId: 'system-scheduler',
              });
            }
          }
        }

        t.delete(slotRef);

        const auditRef = adminDb.collection('audit_logs').doc();
        t.set(auditRef, {
          eventType: 'LOCK_EXPIRED',
          therapistId,
          date,
          time,
          userId: data.userId,
          lockId,
          timestamp: FieldValue.serverTimestamp(),
          details: `Slot lock expired and cleaned up for therapist ${therapistId} on ${date} at ${time}`,
        });

        return true;
      });
    } catch (err) {
      logger.error('Failed to expire slot lock in transaction', { error: err, therapistId, date, time, lockId });
      return false;
    }
  }

  /**
   * Scans and cleans up all expired locks.
   * If a lock has an associated awaiting_payment booking, cancels it due to timeout.
   */
  static async cleanExpiredLocks(): Promise<{ cleanedCount: number }> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    let cleanedCount = 0;
    try {
      const now = new Date();
      // Query locks that have expired
      const expiredLocksSnapshot = await adminDb
        .collection('locked_slots')
        .where('expiresAt', '<', Timestamp.fromDate(now))
        .get();

      for (const doc of expiredLocksSnapshot.docs) {
        const data = doc.data();
        const success = await this.expireLock(
          data.therapistId,
          data.date,
          data.time,
          data.lockId
        );
        if (success) {
          cleanedCount++;
        }
      }
    } catch (err) {
      logger.error('Error during automatic expired locks cleanup', { error: err });
    }

    return { cleanedCount };
  }
}
