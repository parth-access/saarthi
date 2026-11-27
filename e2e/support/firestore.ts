import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE_EMULATOR_HOST, PROJECT_ID } from '../env';

// The Admin SDK talks to the emulator whenever this variable is set.
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR_HOST;

let db: Firestore | null = null;

/** Admin access to the emulator, for seeding and for asserting on stored state. */
export function emulatorDb(): Firestore {
  if (!db) {
    const app = getApps().find((a) => a.name === 'e2e') ?? initializeApp({ projectId: PROJECT_ID }, 'e2e');
    db = getFirestore(app);
  }
  return db;
}

export async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Could not clear the Firestore emulator: ${res.status}`);
}

export const THERAPIST = {
  id: 'e2e-therapist',
  name: 'Asha Test',
  /** Rupees, as the app stores it. Razorpay sees 149900 paise. */
  sessionPrice: 1499,
};

/** A day two days ahead in IST, so it is never "today" or in the past. */
export function bookingDate(): { iso: string; dayNum: number; monthShort: string } {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000);
  const iso = ist.toISOString().slice(0, 10);
  const monthShort = ist.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return { iso, dayNum: ist.getUTCDate(), monthShort };
}

/** One active therapist with four 45-minute slots (10:00–13:00) on bookingDate(). */
export async function seedTherapist(): Promise<void> {
  const firestore = emulatorDb();
  const { iso } = bookingDate();
  await firestore.collection('therapists').doc(THERAPIST.id).set({
    name: THERAPIST.name,
    specialization: 'Anxiety & stress',
    experience: '5',
    bio: 'Seeded for end-to-end tests.',
    active: true,
    slug: 'asha-test',
    email: 'asha.test@example.test',
    sessionPrice: THERAPIST.sessionPrice,
  });
  await firestore
    .collection('therapistAvailability')
    .doc(THERAPIST.id)
    .collection('overrides')
    .doc(iso)
    .set({
      therapistId: THERAPIST.id,
      date: iso,
      type: 'available',
      startTime: '10:00',
      endTime: '13:00',
      slotDuration: 45,
      cooldownGap: 0,
      breaks: [],
    });
}

export interface StoredBooking {
  id: string;
  status: string;
  paymentStatus?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  email: string;
  time: string;
  [key: string]: unknown;
}

export async function bookingsFor(email: string): Promise<StoredBooking[]> {
  const snap = await emulatorDb().collection('bookings').where('email', '==', email).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StoredBooking);
}

export async function confirmedBookingsAt(time: string): Promise<StoredBooking[]> {
  const snap = await emulatorDb()
    .collection('bookings')
    .where('therapistId', '==', THERAPIST.id)
    .where('status', '==', 'confirmed')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StoredBooking).filter((b) => b.time === time);
}

export function slotId(time: string): string {
  return `${THERAPIST.id}_${bookingDate().iso}_${time}`;
}

/** Makes the hold on a slot look like it ran out a minute ago. */
export async function expireSlotHold(time: string): Promise<void> {
  const ref = emulatorDb().collection('locked_slots').doc(slotId(time));
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`No hold on ${time} to expire`);
  const past = Timestamp.fromDate(new Date(Date.now() - 60_000));
  await ref.update({ expiresAt: past });
  const bookingId = snap.data()?.bookingId as string | undefined;
  if (bookingId) await emulatorDb().collection('bookings').doc(bookingId).update({ holdExpiresAt: past });
}

export async function auditEvents(bookingId: string): Promise<string[]> {
  const snap = await emulatorDb().collection('audit_logs').where('bookingId', '==', bookingId).get();
  return snap.docs.map((d) => d.data().eventType as string);
}
