import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The therapist bookability switch — the one admin-only write of
 * `therapists/{id}.active`.
 *
 * This endpoint exists because the only previous write path
 * (`/api/therapist/status`) authorized the therapist themselves via
 * `checkTherapistAccess`, which made "hide this therapist from all clients" a
 * permission the therapist also held. Here the authorization is
 * `requireAdmin` only, the change is stated before it is made (the UI confirms),
 * and the before/after is written to the system `audit_logs` the schedule
 * endpoint already uses — the same record an auditor would look for.
 *
 * What the switch does and does not do, enforced across the platform:
 *  - the therapist disappears from public discovery and the booking wizard
 *    (which already filter on `active`);
 *  - the availability endpoint offers no slots and the create/lock paths refuse
 *    new bookings outright;
 *  - EXISTING bookings are untouched — confirm, reschedule, complete, cancel,
 *    refunds and reminders never read this field, so a therapist's past work
 *    stays manageable however this flag is set.
 */
const bookabilitySchema = z.object({ active: z.boolean() });

const READABLE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function POST(req: NextRequest, context: { params: Promise<{ therapistId: string }> }) {
  const authResult = await requireAdmin(req as unknown as Request);
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const limit = checkRateLimit(getClientIp(req), 'admin_therapist_bookability', 15, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many changes in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { therapistId } = await context.params;
  if (!READABLE_ID.test(therapistId) || therapistId.startsWith('__')) {
    return NextResponse.json({ error: 'That is not a valid therapist id.' }, { status: 400 });
  }

  let active: boolean;
  try {
    const parsed = bookabilitySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'active is required and must be true or false.' }, { status: 400 });
    }
    active = parsed.data.active;
  } catch {
    return NextResponse.json({ error: 'A JSON body with active is required.' }, { status: 400 });
  }

  const therapistRef = adminDb.collection('therapists').doc(therapistId);
  const beforeSnap = await therapistRef.get();
  if (!beforeSnap.exists) {
    return NextResponse.json({ error: 'No therapist exists with that id.' }, { status: 404 });
  }

  const before = beforeSnap.data()?.active === false ? false : true;
  if (before === active) {
    return NextResponse.json({
      success: true,
      changed: false,
      summary: active
        ? 'This therapist is already bookable; nothing was written.'
        : 'This therapist is already not bookable; nothing was written.',
    });
  }

  await therapistRef.update({ active, updatedAt: FieldValue.serverTimestamp() });

  // The durable audit row — before/after and who changed it — written directly,
  // the way the schedule endpoint does it. The generic auditService singleton
  // has no repository behind it, so writing here is what makes this change
  // findable later.
  await adminDb.collection('audit_logs').add({
    eventType: 'THERAPIST_BOOKABILITY_CHANGED',
    userId: session.uid,
    therapistId,
    before: { active: before },
    after: { active },
    details: active
      ? `Therapist ${therapistId} made bookable by admin ${session.uid}`
      : `Therapist ${therapistId} made not bookable by admin ${session.uid}`,
    timestamp: FieldValue.serverTimestamp(),
  });

  logger.info('THERAPISTS', `Admin set therapist ${therapistId} bookability to ${active}`, {
    adminUid: session.uid,
  });

  return NextResponse.json({
    success: true,
    changed: true,
    active,
    summary: active
      ? 'This therapist is bookable again: discoverable by clients, with their schedule offering slots as stored.'
      : 'This therapist is no longer bookable: hidden from clients, offered no slots, and new bookings refused. Existing bookings are unaffected.',
  });
}
