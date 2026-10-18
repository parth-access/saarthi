import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { logger } from '@/app/api/_lib/logger';
import { isReadableTherapistId } from '../../therapistIdGuard';

export const dynamic = 'force-dynamic';

/**
 * Archive (remove) or restore a therapist.
 *
 * Therapists are never hard-deleted: bookings, receipts, refunds, session notes
 * and audit rows all reference the therapist document. Archiving instead:
 *  - sets `archived: true` and `active: false` (never bookable; hidden from the
 *    public site and from the admin roster by default);
 *  - leaves every existing booking untouched and manageable.
 * Restoring clears `archived` but does NOT make them bookable — an operator
 * switches bookability on separately, after checking the schedule.
 *
 * Refused while the therapist still has upcoming confirmed sessions, so no
 * client is left with a session from a therapist who has been removed.
 */
const schema = z.object({ archived: z.boolean() });

const UPCOMING_STATUSES = ['confirmed', 'rescheduled', 'awaiting_payment', 'pending_payment', 'pending', 'pending_approval'];

function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function POST(req: Request, context: { params: Promise<{ therapistId: string }> }) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  if (!checkRateLimit(getClientIp(req), 'admin_therapist_archive', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many changes in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  const { therapistId } = await context.params;
  if (!isReadableTherapistId(therapistId)) {
    return NextResponse.json({ error: 'That is not a valid therapist id.' }, { status: 400 });
  }

  let archived: boolean;
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'archived must be true or false.' }, { status: 400 });
    archived = parsed.data.archived;
  } catch {
    return NextResponse.json({ error: 'A JSON body with archived is required.' }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('therapists').doc(therapistId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'No therapist exists with that id.' }, { status: 404 });
    const data = snap.data() ?? {};
    const before = { archived: data.archived === true, active: data.active !== false };

    if (before.archived === archived) {
      return NextResponse.json({
        success: true,
        changed: false,
        summary: archived ? 'This therapist is already archived.' : 'This therapist is not archived.',
      });
    }

    if (archived) {
      const upcoming = await adminDb
        .collection('bookings')
        .where('therapistId', '==', therapistId)
        .where('date', '>=', istToday())
        .limit(50)
        .get();
      const live = upcoming.docs.filter((d) => UPCOMING_STATUSES.includes(String(d.data().status)));
      if (live.length > 0) {
        return NextResponse.json(
          {
            error: `This therapist still has ${live.length}${upcoming.size === 50 ? '+' : ''} upcoming session${live.length === 1 ? '' : 's'}. Cancel or reassign them first, or just mark the therapist not bookable.`,
          },
          { status: 409 }
        );
      }
    }

    const after = archived ? { archived: true, active: false } : { archived: false, active: before.active };
    await ref.update({
      ...after,
      archivedAt: archived ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await adminDb.collection('audit_logs').add({
      eventType: archived ? 'THERAPIST_ARCHIVED' : 'THERAPIST_RESTORED',
      userId: session.uid,
      therapistId,
      before,
      after,
      details: `Therapist ${therapistId} ${archived ? 'archived' : 'restored'} by admin ${session.uid}`,
      timestamp: FieldValue.serverTimestamp(),
    });
    logger.info('THERAPISTS', `Admin ${archived ? 'archived' : 'restored'} therapist`, { adminUid: session.uid, therapistId });

    return NextResponse.json({
      success: true,
      changed: true,
      summary: archived
        ? 'Therapist archived: hidden from clients and the roster, and can never be booked. Their past sessions and records are kept.'
        : 'Therapist restored. They are still not bookable — check their schedule, then mark them bookable.',
    });
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Therapist archive change failed', error, { therapistId });
    return NextResponse.json({ error: 'The change could not be saved. Please try again.' }, { status: 500 });
  }
}
