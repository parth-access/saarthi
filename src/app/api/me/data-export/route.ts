import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { checkRateLimit, getClientIp } from '../../_lib/rateLimit';
import { logger } from '../../_lib/logger';
import { istDateTime } from '@/domains/admin/csv';

export const dynamic = 'force-dynamic';

/**
 * "Download my data" — DPDP Act right to access (s.11).
 *
 * Returns, as one JSON file, everything Saarthi holds about the signed-in
 * person: account profile, bookings, payment and refund records, reviews,
 * requests, contact-form messages, and session summaries their therapist
 * explicitly SHARED with them.
 *
 * Built from ALLOW-LISTS, never by dumping documents: a field is included only
 * if it is named below. That keeps out therapist-only material (private
 * session notes, internal ops/audit fields, tokens) even if new fields are
 * added to documents later. Bookings match by account id, or by email only
 * when that email is verified (same ownership rule as the rest of the app).
 * Every export is written to audit_logs.
 */

const BOOKING_FIELDS = [
  'date', 'time', 'therapistId', 'sessionType', 'sessionMode', 'status', 'name', 'email', 'phone',
  'gender', 'age', 'message', 'paymentStatus', 'paymentAmount', 'paymentCurrency', 'razorpayOrderId',
  'razorpayPaymentId', 'refundStatus', 'refundAmount', 'followUpStatus', 'cancellationOrRejectionReason',
  'declineReason', 'createdAt', 'updatedAt',
] as const;
const PROFILE_FIELDS = ['name', 'email', 'phone', 'bio', 'notifications', 'role', 'createdAt', 'updatedAt'] as const;
const REVIEW_FIELDS = ['bookingId', 'therapistId', 'rating', 'comment', 'createdAt'] as const;
const REFUND_FIELDS = ['bookingId', 'status', 'amountRefundedPaise', 'createdAt', 'updatedAt'] as const;
const REQUEST_FIELDS = ['bookingId', 'therapistId', 'status', 'reason', 'createdAt'] as const;
const CONTACT_FIELDS = ['name', 'email', 'message', 'status', 'createdAt'] as const;

type Doc = Record<string, unknown>;

function plain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return istDateTime(value) + ' IST';
  }
  if (value instanceof Date) return istDateTime(value) + ' IST';
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Doc).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

function pick(id: string, data: Doc, fields: readonly string[]): Doc {
  const out: Doc = { id };
  for (const f of fields) if (data[f] !== undefined) out[f] = plain(data[f]);
  return out;
}

export async function GET(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!checkRateLimit(getClientIp(req), 'self_data_export', 3, 10 * 60_000).success) {
    return NextResponse.json({ error: 'You can download your data a few times every 10 minutes. Please try again shortly.' }, { status: 429 });
  }

  const uid = session.uid;
  // verifySession only carries an email when it is verified.
  const email = session.email?.toLowerCase() ?? null;

  try {
    const [userSnap, byUid, byEmail] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('bookings').where('userId', '==', uid).limit(1000).get(),
      email ? adminDb.collection('bookings').where('email', '==', email).limit(1000).get() : Promise.resolve(null),
    ]);

    const bookingDocs = new Map<string, Doc>();
    for (const d of [...byUid.docs, ...(byEmail?.docs ?? [])]) bookingDocs.set(d.id, d.data());
    const bookingIds = [...bookingDocs.keys()];

    // Therapist names (public info) for readability.
    const therapistIds = [...new Set([...bookingDocs.values()].map((b) => String(b.therapistId ?? '')).filter(Boolean))];
    const therapistNames = new Map<string, string>();
    await Promise.all(
      therapistIds.map(async (id) => {
        const t = await adminDb.collection('therapists').doc(id).get();
        therapistNames.set(id, typeof t.data()?.name === 'string' ? (t.data()!.name as string) : id);
      })
    );

    // Per-booking reads: shared summaries, reviews, refunds (chunked "in" queries).
    const chunks: string[][] = [];
    for (let i = 0; i < bookingIds.length; i += 30) chunks.push(bookingIds.slice(i, i + 30));

    const [notesSnaps, reviewSnaps, refundSnaps, rescheduleSnap, reconnectSnap, contactSnap] = await Promise.all([
      Promise.all(bookingIds.map((id) => adminDb.collection('session_notes').doc(`session_notes_${id}`).get())),
      Promise.all(bookingIds.map((id) => adminDb.collection('reviews').doc(`review_${id}`).get())),
      Promise.all(chunks.map((c) => adminDb.collection('refunds').where('bookingId', 'in', c).get())),
      adminDb.collection('reschedule_requests').where('userId', '==', uid).limit(500).get(),
      adminDb.collection('therapist_reconnect_requests').where('userId', '==', uid).limit(500).get(),
      email ? adminDb.collection('contacts').where('email', '==', email).limit(500).get() : Promise.resolve(null),
    ]);

    const sharedSummaries = notesSnaps
      .filter((s) => s.exists && s.data()?.clientSummaryShared === true && typeof s.data()?.clientSummary === 'string')
      .map((s) => ({
        bookingId: String(s.id).replace(/^session_notes_/, ''),
        summary: s.data()!.clientSummary as string,
        sharedAt: plain(s.data()!.clientSummarySharedAt ?? null),
      }));

    const bookings = [...bookingDocs.entries()]
      .map(([id, b]): Doc => ({
        ...pick(id, b, BOOKING_FIELDS),
        therapistName: therapistNames.get(String(b.therapistId ?? '')) ?? null,
      }))
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    const exportDoc = {
      about: {
        service: 'Saarthi (saarthilife.com)',
        generatedAt: istDateTime(new Date()) + ' IST',
        description:
          'All personal data Saarthi holds about your account. Your therapist’s private clinical notes are their professional records and are not part of this export; summaries they chose to share with you are included.',
        questions: 'contact@saarthilife.com',
      },
      account: userSnap.exists ? pick(uid, userSnap.data() ?? {}, PROFILE_FIELDS) : { id: uid, email: session.email ?? null },
      bookings,
      sharedSessionSummaries: sharedSummaries,
      reviews: reviewSnaps.filter((s) => s.exists).map((s) => pick(s.id, s.data() ?? {}, REVIEW_FIELDS)),
      refunds: refundSnaps.flatMap((q) => q.docs.map((d) => pick(d.id, d.data(), REFUND_FIELDS))),
      rescheduleRequests: rescheduleSnap.docs.map((d) => pick(d.id, d.data(), REQUEST_FIELDS)),
      reconnectRequests: reconnectSnap.docs.map((d) => pick(d.id, d.data(), REQUEST_FIELDS)),
      contactMessages: contactSnap?.docs.map((d) => pick(d.id, d.data(), CONTACT_FIELDS)) ?? [],
    };

    await adminDb.collection('audit_logs').add({
      eventType: 'USER_DATA_EXPORTED',
      userId: uid,
      after: { bookings: bookings.length },
      details: `User ${uid} downloaded their personal data`,
      timestamp: FieldValue.serverTimestamp(),
    });

    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    return new Response(JSON.stringify(exportDoc, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="saarthi-my-data-${today}.json"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    logger.error('SYSTEM', 'Self data export failed', error, { uid });
    return NextResponse.json({ error: 'We could not prepare your data right now. Please try again.' }, { status: 500 });
  }
}
