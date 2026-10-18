import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * A therapist pausing or resuming NEW bookings for themselves (e.g. leave).
 *
 * Same effect as the admin bookability switch: while paused they are hidden
 * from the booking page and new requests are refused; existing sessions are
 * untouched. An archived therapist cannot resume — only an admin can restore.
 */
const schema = z.object({ active: z.boolean() });

export async function POST(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'therapist') {
    return NextResponse.json({ error: 'Only therapists can pause their own bookings.' }, { status: 403 });
  }

  if (!checkRateLimit(getClientIp(req), 'therapist_self_bookability', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many changes in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  let active: boolean;
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'active must be true or false.' }, { status: 400 });
    active = parsed.data.active;
  } catch {
    return NextResponse.json({ error: 'A JSON body with active is required.' }, { status: 400 });
  }

  try {
    const found = await adminDb.collection('therapists').where('authId', '==', session.uid).limit(2).get();
    if (found.size !== 1) {
      return NextResponse.json({ error: 'No therapist profile is linked to this account.' }, { status: 404 });
    }
    const doc = found.docs[0];
    const data = doc.data();
    if (data.archived === true) {
      return NextResponse.json(
        { error: 'Your profile has been archived by the practice. Contact an administrator to restore it.' },
        { status: 409 }
      );
    }
    const before = data.active !== false;
    if (before === active) {
      return NextResponse.json({ success: true, changed: false, active });
    }

    await doc.ref.update({ active, updatedAt: FieldValue.serverTimestamp() });
    await adminDb.collection('audit_logs').add({
      eventType: 'THERAPIST_BOOKABILITY_CHANGED',
      userId: session.uid,
      therapistId: doc.id,
      before: { active: before },
      after: { active },
      details: `Therapist ${doc.id} ${active ? 'resumed' : 'paused'} new bookings themselves`,
      timestamp: FieldValue.serverTimestamp(),
    });
    logger.info('THERAPISTS', `Therapist ${active ? 'resumed' : 'paused'} bookings`, { therapistId: doc.id });

    return NextResponse.json({ success: true, changed: true, active });
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Therapist self bookability change failed', error);
    return NextResponse.json({ error: 'The change could not be saved. Please try again.' }, { status: 500 });
  }
}
