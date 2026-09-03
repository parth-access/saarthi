import { adminDb } from '@/lib/firebase/admin';
import { Booking } from '../entities/Booking';
import { BookingRepository } from './BookingRepository';
import { logger } from '@/shared/logger';
import { Transaction, FieldValue, FieldPath, Timestamp, DocumentSnapshot, QueryDocumentSnapshot, QuerySnapshot, Query } from 'firebase-admin/firestore';
import type { TxReader, TxWriter } from '@/shared/firestore/transactionPhases';
import type { AdminBookingQueryPlan, BookingLookup } from '../queries/adminBookingQuery';
import { assertNoSentinelsInsideArrays } from '@/shared/utils/firestoreSafe';
import crypto from 'crypto';

export class BookingMapper {
  static toEntity(doc: DocumentSnapshot | QueryDocumentSnapshot): Booking {
    const data = doc.data();
    if (!data) {
      throw new Error(`Document ${doc.id} has no data`);
    }
    return new Booking({
      id: doc.id,
      ...data,
    });
  }

  /**
   * Serializes a booking for Firestore.
   *
   * Fails fast — with the offending field path — if a `FieldValue` sentinel ended
   * up inside an array. Firestore rejects that at commit time with a message that
   * aborts the whole transaction (the production
   * `... found in field "rescheduleHistory.0.rescheduledAt"` failure), so catching
   * it at the mapper turns a silent transaction rollback into a precise error.
   * The primary defence is the `ArraySafeTimestamp` type on array-element
   * timestamps; this is the runtime backstop for untyped callers.
   */
  static toPersistence(booking: Partial<Booking>): Record<string, unknown> {
    // Strip redundant doc id from doc payload
    const { id, ...data } = booking as Record<string, unknown>;
    const record: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        record[key] = value;
      }
    }
    assertNoSentinelsInsideArrays(record, `BookingMapper.toPersistence(${String(id ?? 'unknown')})`);
    return record;
  }
}

export class FirestoreBookingRepository implements BookingRepository {
  generateId(): string {
    const YYYYMMDD = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `bk_${YYYYMMDD}_${randomSuffix}`;
  }

  async create(booking: Booking, transaction?: Transaction): Promise<void> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const docRef = adminDb.collection('bookings').doc(booking.id);
    const persistenceData = BookingMapper.toPersistence(booking);
    const data = {
      ...persistenceData,
      createdAt: booking.createdAt || FieldValue.serverTimestamp(),
      updatedAt: booking.updatedAt || FieldValue.serverTimestamp(),
    };

    if (transaction) {
      const doc = await transaction.get(docRef);
      if (doc.exists) {
        throw new Error(`Booking with ID ${booking.id} already exists.`);
      }
      transaction.set(docRef, data);
    } else {
      await adminDb.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (doc.exists) {
          throw new Error(`Booking with ID ${booking.id} already exists.`);
        }
        t.set(docRef, data);
      });
    }
  }

  async lockSlot(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    expiresAt: Date,
    transaction?: Transaction
  ): Promise<boolean> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const slotId = `${therapistId}_${date}_${time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    const executeLock = async (t: Transaction) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const data = doc.data();
        let isExpired = false;
        if (data?.expiresAt) {
          const expiresDate = typeof data.expiresAt.toDate === 'function'
            ? data.expiresAt.toDate()
            : typeof data.expiresAt.toMillis === 'function'
            ? new Date(data.expiresAt.toMillis())
            : new Date(data.expiresAt);
          if (expiresDate < new Date()) {
            isExpired = true;
          }
        }

        if (isExpired) {
          // Lock is expired, can overwrite
        } else if (data?.bookingId) {
          return false;
        } else if (data?.lockId && data.lockId !== lockId) {
          return false;
        }
      }

      t.set(slotRef, {
        therapistId,
        date,
        time,
        lockId,
        expiresAt: Timestamp.fromDate(expiresAt),
        createdAt: FieldValue.serverTimestamp(),
      });
      return true;
    };

    if (transaction) {
      return executeLock(transaction);
    } else {
      try {
        return await adminDb.runTransaction(async (t) => {
          return executeLock(t);
        });
      } catch (err) {
        logger.error('Failed to lock slot in transaction', { error: err, therapistId, date, time });
        return false;
      }
    }
  }

  async releaseSlot(
    therapistId: string,
    date: string,
    time: string,
    lockId: string,
    transaction?: Transaction
  ): Promise<void> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const slotId = `${therapistId}_${date}_${time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    const executeRelease = async (t: Transaction) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const data = doc.data();
        // Safe non-blind delete guard: must match lockId and have NO active booking
        if (data?.lockId === lockId && !data.bookingId) {
          t.delete(slotRef);
        }
      }
    };

    if (transaction) {
      await executeRelease(transaction);
    } else {
      await adminDb.runTransaction(async (t) => {
        await executeRelease(t);
      });
    }
  }

  /**
   * Read-only seam: accepts a `TxReader` so it can be called from a transaction's
   * read phase (and is not allowed to grow a write).
   */
  async findById(bookingId: string, transaction?: TxReader): Promise<Booking | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const docRef = adminDb.collection('bookings').doc(bookingId);
    const doc = transaction ? await transaction.get(docRef) : await docRef.get();
    if (!doc.exists) return null;
    return BookingMapper.toEntity(doc);
  }

  async findByToken(token: string): Promise<Booking | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const query = adminDb.collection('bookings').where('bookingToken', '==', token).limit(1);
    const snapshot = await query.get();
    if (snapshot.empty) return null;
    return BookingMapper.toEntity(snapshot.docs[0]);
  }

  /**
   * Finds stale/expired bookings awaiting payment or pending beyond a threshold timeout.
   */
  async findStaleBookings(timeoutThreshold: Date, limitCount: number = 500): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection('bookings')
      .where('status', 'in', ['awaiting_payment', 'pending'])
      .where('createdAt', '<', Timestamp.fromDate(timeoutThreshold))
      .limit(limitCount)
      .get();
    return snapshot.docs.map(doc => BookingMapper.toEntity(doc));
  }

  /**
   * @deprecated Use findStaleBookings instead.
   */
  async findExpiredLocks(timeoutThreshold: Date): Promise<Booking[]> {
    return this.findStaleBookings(timeoutThreshold);
  }

  async save(booking: Booking, transaction?: TxWriter): Promise<void> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const docRef = adminDb.collection('bookings').doc(booking.id);
    const persistenceData = BookingMapper.toPersistence(booking);
    const data = {
      ...persistenceData,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (transaction) {
      transaction.set(docRef, data, { merge: true });
    } else {
      await docRef.set(data, { merge: true });
    }
  }

  async findAll(limitCount: number = 500): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection('bookings')
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs.map(doc => BookingMapper.toEntity(doc));
  }

  async findByTherapistId(therapistId: string, limitCount: number = 500): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection('bookings')
      .where('therapistId', '==', therapistId)
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs.map(doc => BookingMapper.toEntity(doc));
  }

  async findActiveBookingsByTherapistAndDate(therapistId: string, date: string): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['pending', 'pending_approval', 'awaiting_payment', 'confirmed'])
      .get();
    return snapshot.docs.map(doc => BookingMapper.toEntity(doc));
  }

  async findByOrderId(orderId: string): Promise<Booking | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection('bookings')
      .where('razorpayOrderId', '==', orderId)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    return BookingMapper.toEntity(snapshot.docs[0]);
  }

  /**
   * Finds confirmed bookings whose Google Calendar/Meet creation failed or is still pending,
   * so a cron can re-drive `createOrSyncCalendarEvent` (idempotent). Uses a single-field `in`
   * query (no composite index) and filters status + missing meetingUrl in memory.
   */
  async findBookingsNeedingCalendarRetry(limitCount: number = 25): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection('bookings')
      .where('calendarStatus', 'in', ['RETRY_REQUIRED', 'FAILED', 'PENDING'])
      .limit(limitCount)
      .get();
    return snapshot.docs
      .map(doc => BookingMapper.toEntity(doc))
      .filter(b => b.status === 'confirmed' && !b.meetingUrl);
  }

  /**
   * Every booking belonging to one client.
   *
   * Two equality queries merged in memory rather than one `Filter.or`, because a
   * booking made while signed in carries `userId` while a guest booking carries
   * only `email`, and the same person legitimately has both. Two single-field
   * queries need no composite index and cannot silently return a partial set the
   * way a mis-indexed OR would.
   *
   * The identities MUST come from a verified session. This method is the read
   * side of receipt authorization, so passing a client-supplied email here would
   * hand over somebody else's records.
   */
  async findByClient(
    identity: { uid?: string; email?: string },
    limitCount: number = 200
  ): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const uid = identity.uid?.trim();
    const email = identity.email?.trim();
    if (!uid && !email) return [];

    const collection = adminDb.collection('bookings');
    const queries = [
      uid ? collection.where('userId', '==', uid).limit(limitCount).get() : null,
      email ? collection.where('email', '==', email).limit(limitCount).get() : null,
    ].filter((q): q is Promise<QuerySnapshot> => q !== null);

    const snapshots = await Promise.all(queries);
    const byId = new Map<string, Booking>();
    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        if (!byId.has(doc.id)) byId.set(doc.id, BookingMapper.toEntity(doc));
      }
    }
    return Array.from(byId.values());
  }

  /* ---------------------------------------------------------------- *
   * Admin console reads
   *
   * Deliberately not on the `BookingRepository` interface. That contract is
   * what the booking domain needs to function; these two are a reporting
   * surface for one screen, and widening the interface would force every
   * implementation (including test doubles) to grow methods no domain command
   * calls.
   * ---------------------------------------------------------------- */

  /**
   * One page of the admin bookings list, executed exactly as planned.
   *
   * The plan comes from `planAdminBookingList`, which has already refused any
   * filter combination this project has no composite index for — so a query that
   * reaches Firestore here is one the index file supports. Nothing is filtered
   * after the fetch: a page must be a real page, because dropping rows in memory
   * turns "50 per page" into an unpredictable number and makes an empty result
   * indistinguishable from "no matches exist".
   *
   * `hasMore` comes from the plan asking for one extra document rather than from
   * a `count()` call, which would double the reads on every page turn.
   */
  async findAdminPage(plan: AdminBookingQueryPlan): Promise<{ bookings: Booking[]; hasMore: boolean }> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');

    let query: Query = adminDb.collection('bookings');
    for (const clause of plan.where) {
      query =
        clause.op === 'in'
          ? query.where(clause.field, 'in', clause.value as readonly string[])
          : query.where(clause.field, '==', clause.value as string);
    }
    for (const order of plan.orderBy) {
      query =
        order.field === '__name__'
          ? query.orderBy(FieldPath.documentId(), order.direction)
          : query.orderBy(order.field, order.direction);
    }
    if (plan.startAfter) {
      // Both cursor components, in the same order as `orderBy`: the timestamp
      // positions the page and the document id breaks ties within a millisecond.
      query = query.startAfter(Timestamp.fromMillis(plan.startAfter.createdAtMs), plan.startAfter.id);
    }

    const snapshot = await query.limit(plan.limit).get();
    const docs = snapshot.docs.slice(0, plan.pageSize);
    return {
      bookings: docs.map((doc) => BookingMapper.toEntity(doc)),
      hasMore: snapshot.docs.length > plan.pageSize,
    };
  }

  /**
   * Bookings matching one typed search term.
   *
   * Every branch is an exact match or a prefix range on a single field, so each
   * is served by Firestore's automatic single-field indexes and stays fast no
   * matter how large `bookings` grows. That is the whole point: the console this
   * replaces searched by downloading the collection and filtering in JavaScript,
   * which silently stopped finding anything past its 500-document ceiling.
   */
  async lookupForAdmin(lookup: BookingLookup, limitCount: number = 25): Promise<Booking[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const collection = adminDb.collection('bookings');

    if (lookup.kind === 'bookingId') {
      const found = await this.findById(lookup.values[0]);
      return found ? [found] : [];
    }

    if (lookup.kind === 'namePrefix') {
      const prefix = lookup.values[0];
      // Firestore has no "starts with" operator, so the prefix becomes a bounded
      // range: from the prefix itself up to the prefix followed by U+F8FF, a
      // private-use code point that sorts above any character a stored name will
      // contain. Built with an escape rather than pasted as a literal, which would
      // leave an invisible character in the source.
      const upperBound = `${prefix}\uf8ff`;
      const snapshot = await collection
        .where('name', '>=', prefix)
        .where('name', '<=', upperBound)
        .orderBy('name', 'asc')
        .limit(limitCount)
        .get();
      return snapshot.docs.map((doc) => BookingMapper.toEntity(doc));
    }

    const field =
      lookup.kind === 'orderId'
        ? 'razorpayOrderId'
        : lookup.kind === 'paymentId'
          ? 'razorpayPaymentId'
          : lookup.kind === 'email'
            ? 'email'
            : 'phone';

    const snapshots = await Promise.all(
      lookup.values.map((value) => collection.where(field, '==', value).limit(limitCount).get())
    );
    const byId = new Map<string, Booking>();
    for (const snapshot of snapshots) {
      for (const doc of snapshot.docs) {
        if (!byId.has(doc.id)) byId.set(doc.id, BookingMapper.toEntity(doc));
      }
    }
    return Array.from(byId.values());
  }
}

export const firestoreBookingRepository = new FirestoreBookingRepository();
