import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '../../../_lib/rateLimit';
import { logger } from '../../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Upload a therapist photo.
 *
 * Stored in Firestore (`therapist_photos/{id}`) rather than Firebase Storage,
 * which needs the paid Blaze plan. The console resizes to ≤800px WebP first, so
 * a photo is typically 50–150 KB — well under Firestore's 1 MiB document limit.
 * It is served by GET /api/therapist-photo/{id} with immutable CDN caching, so
 * Firestore is read roughly once per photo, not once per page view.
 */
const MAX_BYTES = 700_000;
const ALLOWED = new Set(['image/webp', 'image/jpeg', 'image/png']);

const schema = z.object({ dataUrl: z.string().max(1_000_000) });

export async function POST(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  if (!checkRateLimit(getClientIp(req), 'admin_therapist_photo', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many uploads in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  let dataUrl: string;
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'The image is too large or missing.' }, { status: 400 });
    dataUrl = parsed.data.dataUrl;
  } catch {
    return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  }

  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || !ALLOWED.has(match[1])) {
    return NextResponse.json({ error: 'Upload a WebP, JPEG or PNG image.' }, { status: 400 });
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'The image must be under 700 KB after resizing.' }, { status: 400 });
  }

  try {
    const id = crypto.randomUUID();
    await adminDb.collection('therapist_photos').doc(id).set({
      contentType: match[1],
      data: bytes,
      size: bytes.length,
      uploadedBy: authorized.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, url: `/api/therapist-photo/${id}` });
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Therapist photo upload failed', error);
    return NextResponse.json({ error: 'The photo could not be uploaded. Please try again.' }, { status: 500 });
  }
}
