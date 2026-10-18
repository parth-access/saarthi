import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * A therapist editing their OWN public profile: specialization, experience,
 * bio and photo. Name, profile URL, prices, sign-in email, bookability and
 * archiving stay with the practice (admin console). Audited before/after.
 */
const text = (max: number) =>
  z.string().trim().max(max).transform((v) => (v.length === 0 ? null : v)).nullable();

const schema = z.object({
  specialization: text(150),
  experience: text(60),
  bio: text(2000),
  image: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === '' || v.startsWith('https://') || /^\/[A-Za-z0-9._\-/]+$/.test(v), {
      message: 'Photo must be an uploaded image or an https URL.',
    })
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
});

const FIELDS = ['specialization', 'experience', 'bio', 'image'] as const;

export async function PATCH(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'therapist') {
    return NextResponse.json({ error: 'Only therapists can edit their own profile here.' }, { status: 403 });
  }
  if (!checkRateLimit(getClientIp(req), 'therapist_self_profile', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many changes in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  let input: z.infer<typeof schema>;
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Some fields are not valid.' }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  }

  try {
    const found = await adminDb.collection('therapists').where('authId', '==', session.uid).limit(2).get();
    if (found.size !== 1) {
      return NextResponse.json({ error: 'No therapist profile is linked to this account.' }, { status: 404 });
    }
    const doc = found.docs[0];
    const data = doc.data();
    if (data.archived === true) {
      return NextResponse.json({ error: 'Your profile has been archived by the practice.' }, { status: 409 });
    }

    const before: Record<string, unknown> = {};
    for (const f of FIELDS) before[f] = typeof data[f] === 'string' ? data[f] : null;

    await doc.ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
    await adminDb.collection('audit_logs').add({
      eventType: 'THERAPIST_PROFILE_UPDATED',
      userId: session.uid,
      therapistId: doc.id,
      before,
      after: input,
      details: `Therapist ${doc.id} updated their own profile`,
      timestamp: FieldValue.serverTimestamp(),
    });
    logger.info('THERAPISTS', 'Therapist updated own profile', { therapistId: doc.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Therapist self profile update failed', error);
    return NextResponse.json({ error: 'Your profile could not be saved. Please try again.' }, { status: 500 });
  }
}
