import { adminDb } from '@/lib/firebase/admin';
import { DocumentReference, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from '@/shared/logger';
import type { TxReader, TxWriter } from '@/shared/firestore/transactionPhases';
import { generateTimeSlots } from '@/shared/scheduling/slots';
import crypto from 'crypto';

export interface LockResult {
  success: boolean;
  lockId?: string;
  expiresAt?: Date;
  error?: string;
}

/**
 * Outcome of the read phase for releasing a slot pin. Carries the document
 * reference and the ownership decision so the write phase needs no further
 * reads.
 */
export interface PinReleasePlan {
  slotRef: DocumentReference;
  /** True only when the pin exists AND belongs to this bookingId. */
  shouldRelease: boolean;
  therapistId: string;
  date: string;
  time: string;
  bookingId: string;
}

/** Outcome of the read phase for moving a booking's pin to a different slot. */
export interface SlotSwapPlan {
  /** Release plan for the slot the booking is leaving. */
  oldPin: PinReleasePlan;
  newSlotRef: DocumentReference;
  /**
   * True when the target slot held an *expired* hold that must be deleted
   * before the new pin is written. Live holds and booked pins throw during the
   * read phase instead.
   */
  clearExpiredTarget: boolean;
  therapistId: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
  bookingId: string;
}

export class SlotReservationService {
  /**
   * Generates a standard document ID for a therapist's slot
   */
  static getSlotId(therapistId: string, date: string, time: string): string {
    return `${therapistId}_${date}_${time}`.replace(/\//g, '-');
  }

  /**
   * READ PHASE — decides whether the pin for this slot may be released, without
   * writing anything. Ownership is enforced here (never a blind delete): the
   * pin is only releasable when it names this exact bookingId.
   *
   * Pair with {@link applyPinRelease}. This split exists because the previous
   * single-call helper performed its `transaction.get` wherever it happened to
   * be invoked, which was after other writes in the cancel and reschedule
   * paths — the production
   * "Firestore transactions require all reads to be executed before all writes"
   * failure.
   */
  static async readPinReleasePlan(
    reader: TxReader,
    therapistId: string,
    date: string,
    time: string,
    bookingId: string
  ): Promise<PinReleasePlan> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const slotRef = adminDb.collection('locked_slots').doc(this.getSlotId(therapistId, date, time));
    const doc = await reader.get(slotRef);
    const shouldRelease = !!doc?.exists && (doc.data() || {}).bookingId === bookingId;

    return { slotRef, shouldRelease, therapistId, date, time, bookingId };
  }

  /**
   * WRITE PHASE — applies a {@link PinReleasePlan}. Returns whether the pin was
   * actually released. Performs no reads, so it is safe to call at any point
   * after the read phase.
   */
  static applyPinRelease(writer: TxWriter, plan: PinReleasePlan): boolean {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }
    if (!plan.shouldRelease) return false;

    writer.delete(plan.slotRef);

    const auditRef = adminDb.collection('audit_logs').doc();
    writer.set(auditRef, {
      eventType: 'SLOT_RELEASED_TX',
      therapistId: plan.therapistId,
      date: plan.date,
      time: plan.time,
      bookingId: plan.bookingId,
      timestamp: FieldValue.serverTimestamp(),
      details: `Slot released safely in transaction for booking ${plan.bookingId}`,
    });
    return true;
  }

  /**
   * Checks that `time` is one of the start times the therapist's recurring rules
   * and date overrides generate for `date` — i.e. CADENCE only. Reservation
   * (`locked_slots`), existing bookings and temporality (past / booking window)
   * are each checked elsewhere by the caller.
   *
   * The generator is imported from `@/shared/scheduling/slots`, the same one
   * `/api/availability` lists with. It used to be a private copy inlined here,
   * which meant the lister and this validator could drift apart and offer a slot
   * that would then be refused.
   */
  static async isSlotInTherapistAvailability(
    therapistId: string,
    date: string,
    time: string,
    t?: TxReader
  ): Promise<boolean> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    // Local-safe date parsing. Weekday is derived in UTC so the server's own
    // timezone cannot shift the calendar date's day-of-week.
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday, 1 = Monday ...

    const rulesRef = adminDb.collection('therapistAvailability').doc(therapistId).collection('recurringRules');
    const overridesRef = adminDb.collection('therapistAvailability').doc(therapistId).collection('overrides');

    const rulesSnapshot = t ? await t.get(rulesRef) : await rulesRef.get();
    const overridesSnapshot = t ? await t.get(overridesRef) : await overridesRef.get();

    const rules = (rulesSnapshot?.docs || []).map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    const overrides = (overridesSnapshot?.docs || []).map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // If no custom rules or overrides are configured for this therapist, default to available
    if (rules.length === 0 && overrides.length === 0) {
      return true;
    }

    // Check overrides first
    const dateOverride = overrides.find(o => o.date === date);

    if (dateOverride?.type === 'blocked') {
      return false;
    }

    let possibleSlots: string[] = [];

    if (dateOverride?.type === 'available' && dateOverride.startTime && dateOverride.endTime) {
      possibleSlots = generateTimeSlots(
        dateOverride.startTime,
        dateOverride.endTime,
        dateOverride.slotDuration || 60,
        dateOverride.cooldownGap !== undefined ? dateOverride.cooldownGap : 0,
        dateOverride.breaks || []
      );
    } else {
      const matchingRules = rules.filter(r => r.dayOfWeek === dayOfWeek && r.isActive !== false);
      const slotSet = new Set<string>();
      matchingRules.forEach(rule => {
        const slots = generateTimeSlots(
          rule.startTime,
          rule.endTime,
          rule.slotDuration,
          rule.cooldownGap !== undefined ? rule.cooldownGap : 0,
          rule.breaks || []
        );
        slots.forEach(s => slotSet.add(s));
      });
      possibleSlots = Array.from(slotSet).sort();
    }

    return possibleSlots.includes(time);
  }

  /**
   * READ PHASE — validates that a booking may move to `newDate`/`newTime` and
   * returns everything the write phase needs. Throws (aborting before any write)
   * when the target slot is booked or actively held by someone else.
   *
   * Both reads it needs — the target slot and the booking's current pin — happen
   * here. The previous single-call version read the target slot, deleted an
   * expired hold, and only *then* read the old pin, which violated Firestore's
   * read-before-write rule whenever the target carried a stale lock.
   */
  static async readSlotSwapPlan(
    reader: TxReader,
    therapistId: string,
    oldDate: string,
    oldTime: string,
    newDate: string,
    newTime: string,
    bookingId: string
  ): Promise<SlotSwapPlan> {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const newSlotRef = adminDb.collection('locked_slots').doc(this.getSlotId(therapistId, newDate, newTime));
    const newSlotDoc = await reader.get(newSlotRef);

    let clearExpiredTarget = false;

    if (newSlotDoc?.exists) {
      const slotData = newSlotDoc.data()!;
      const ownedByThisBooking = slotData?.bookingId === bookingId;

      if (!ownedByThisBooking) {
        const expiresAtDate = toDateOrNull(slotData?.expiresAt);
        if (expiresAtDate && expiresAtDate < new Date()) {
          // Stale hold from an abandoned checkout — reclaimable.
          clearExpiredTarget = true;
        } else if ('bookingId' in slotData) {
          throw new Error('This new slot is already booked.');
        } else {
          throw new Error('This new slot is unavailable.');
        }
      }
    }

    const oldPin = await this.readPinReleasePlan(reader, therapistId, oldDate, oldTime, bookingId);

    return {
      oldPin,
      newSlotRef,
      clearExpiredTarget,
      therapistId,
      oldDate,
      oldTime,
      newDate,
      newTime,
      bookingId,
    };
  }

  /**
   * WRITE PHASE — applies a {@link SlotSwapPlan}: clears a reclaimed stale hold,
   * releases the booking's old pin (ownership-checked during the read phase) and
   * pins the new slot. Performs no reads.
   */
  static applySlotSwap(
    writer: TxWriter,
    plan: SlotSwapPlan,
    bookingContext?: {
      status?: string;
      paymentStatus?: string;
      userId?: string;
      email?: string;
      holdExpiresAt?: unknown;
      lockId?: string;
    }
  ): void {
    if (!adminDb) {
      throw new Error('Firestore adminDb is not initialized.');
    }

    const { newSlotRef, therapistId, oldDate, oldTime, newDate, newTime, bookingId } = plan;

    if (plan.clearExpiredTarget) {
      writer.delete(newSlotRef);
    }

    this.applyPinRelease(writer, plan.oldPin);

    const isConfirmed = bookingContext?.status === 'confirmed' || bookingContext?.paymentStatus === 'paid';
    if (isConfirmed) {
      writer.set(newSlotRef, {
        therapistId,
        date: newDate,
        time: newTime,
        bookingId,
        userId: bookingContext?.userId || bookingContext?.email || 'system',
        status: 'booked',
        isPermanent: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const holdExpiresAt = toDateOrNull(bookingContext?.holdExpiresAt) ?? new Date(Date.now() + 10 * 60 * 1000);

      writer.set(newSlotRef, {
        therapistId,
        date: newDate,
        time: newTime,
        bookingId,
        userId: bookingContext?.userId || bookingContext?.email || 'system',
        lockId: bookingContext?.lockId || crypto.randomUUID(),
        status: 'held',
        expiresAt: Timestamp.fromDate(holdExpiresAt),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const auditRef = adminDb.collection('audit_logs').doc();
    writer.set(auditRef, {
      eventType: 'SLOT_SWAPPED',
      bookingId,
      therapistId,
      oldDate,
      oldTime,
      newDate,
      newTime,
      timestamp: FieldValue.serverTimestamp(),
      details: `Slot swapped from ${oldDate} ${oldTime} to ${newDate} ${newTime} for booking ${bookingId}`,
    });
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
    durationMinutes: number = 10,
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

          if (data.bookingId || data.status === 'booked' || data.isPermanent) {
            return {
              success: false,
              error: 'Slot is already booked and confirmed',
            };
          }

          if (!isExpired) {
            if ((userId && data.userId === userId) || (customLockId && data.lockId === customLockId)) {
              const activeLockId = data.lockId || customLockId || lockId;
              t.update(slotRef, {
                expiresAt: Timestamp.fromDate(expiresAt),
                updatedAt: FieldValue.serverTimestamp(),
              });
              return { success: true, lockId: activeLockId, expiresAt };
            } else {
              return {
                success: false,
                error: 'Slot is currently reserved by another user',
              };
            }
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
          eventType: 'SLOT_HELD',
          therapistId,
          date,
          time,
          userId,
          lockId,
          expiresAt: Timestamp.fromDate(expiresAt),
          timestamp: FieldValue.serverTimestamp(),
          details: `Slot hold acquired for therapist ${therapistId} on ${date} at ${time}`,
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
        if (data.bookingId || data.status === 'booked' || data.isPermanent) {
          return false;
        }

        // Must match the lockId
        if (data.lockId !== lockId) {
          return false;
        }

        // Ownership validation: If userId is passed or present in slot data, verify match
        if (userId && data.userId && data.userId !== userId) {
          return false;
        }


        t.delete(slotRef);

        const auditRef = adminDb.collection('audit_logs').doc();
        t.set(auditRef, {
          eventType: 'SLOT_RELEASED',
          therapistId,
          date,
          time,
          userId: data.userId || userId,
          lockId,
          timestamp: FieldValue.serverTimestamp(),
          details: `Slot hold released for therapist ${therapistId} on ${date} at ${time}`,
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
    durationMinutes: number = 10
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
        if (data.lockId !== lockId || data.bookingId || data.status === 'booked' || data.isPermanent) {
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
          eventType: 'SLOT_HELD_EXTENDED',
          therapistId,
          date,
          time,
          userId: data.userId,
          lockId,
          expiresAt: Timestamp.fromDate(expiresAt),
          timestamp: FieldValue.serverTimestamp(),
          details: `Slot hold extended by ${durationMinutes} minutes for therapist ${therapistId} on ${date} at ${time}`,
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

      if (data.bookingId || data.status === 'booked' || data.isPermanent) {
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
        if (data.status === 'booked' || data.isPermanent) return false;
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
          eventType: 'HOLD_EXPIRED',
          therapistId,
          date,
          time,
          userId: data.userId,
          lockId,
          timestamp: FieldValue.serverTimestamp(),
          details: `Slot hold expired and cleaned up for therapist ${therapistId} on ${date} at ${time}`,
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

/**
 * Coerces the several shapes a stored expiry can take (Firestore `Timestamp`,
 * `Date`, ISO string, epoch millis) into a `Date`, or `null` when absent or
 * unparseable. An unparseable expiry is treated as "no expiry" so a live hold is
 * never mistaken for a stale one.
 */
function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; toMillis?: () => number };
    if (typeof candidate.toDate === 'function') {
      const d = candidate.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof candidate.toMillis === 'function') {
      const ms = candidate.toMillis();
      return Number.isFinite(ms) ? new Date(ms) : null;
    }
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}
