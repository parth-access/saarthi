import { adminDb } from '@/lib/firebase/admin';
import { Booking } from '../entities/Booking';
import { BookingRepository } from './BookingRepository';
import { logger } from '@/shared/logger';
import { Transaction, FieldValue, Timestamp, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
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

  static toPersistence(booking: Partial<Booking>): Record<string, unknown> {
    // Strip redundant doc id from doc payload
    const { id, ...data } = booking as Record<string, unknown>;
    const record: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        record[key] = value;
      }
    }
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

  async findById(bookingId: string, transaction?: Transaction): Promise<Booking | null> {
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

  async save(booking: Booking, transaction?: Transaction): Promise<void> {
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
}

export const firestoreBookingRepository = new FirestoreBookingRepository();
