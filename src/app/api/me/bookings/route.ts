import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * The signed-in person's bookings, plus the therapists they reference, for
 * the client dashboard. Under Better Auth the browser has no Firestore
 * identity, so this replaces the dashboard's direct Firestore query.
 *
 * Ownership is the app-wide rule: bookings tied to the account id, and
 * bookings under the account's email only once that email is verified
 * (verifySession carries an email only when it is verified). The owner could
 * already read these whole documents through Firestore rules, so nothing new
 * is exposed. Timestamps are sent as ISO strings.
 */

type Doc = Record<string, unknown>;

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Doc).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

export async function GET(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE });

  const email = session.email?.toLowerCase() ?? null;

  try {
    const [byUid, byEmail] = await Promise.all([
      adminDb.collection('bookings').where('userId', '==', session.uid).limit(500).get(),
      email ? adminDb.collection('bookings').where('email', '==', email).limit(500).get() : Promise.resolve(null),
    ]);

    const bookings = new Map<string, Doc>();
    for (const d of [...byUid.docs, ...(byEmail?.docs ?? [])]) {
      bookings.set(d.id, { id: d.id, ...(plain(d.data()) as Doc) });
    }
    const list = [...bookings.values()].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    const therapistIds = [...new Set(list.map((b) => b.therapistId).filter((id): id is string => typeof id === 'string' && id !== ''))];
    const therapistSnaps = therapistIds.length
      ? await adminDb.getAll(...therapistIds.map((id) => adminDb.collection('therapists').doc(id)))
      : [];
    const therapists: Record<string, Doc> = {};
    for (const snap of therapistSnaps) {
      if (snap.exists) therapists[snap.id] = { id: snap.id, ...(plain(snap.data()) as Doc) };
    }

    return NextResponse.json({ bookings: list, therapists }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error('BOOKING', 'Could not load dashboard bookings', { uid: session.uid, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'We could not load your sessions right now. Please try again.' },
      { status: 500, headers: PRIVATE_NO_STORE }
    );
  }
}
