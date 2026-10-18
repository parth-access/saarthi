import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '../../../_lib/rateLimit';
import { logger } from '../../../_lib/logger';
import '@/lib/firebase/admin';

export const dynamic = 'force-dynamic';

/** ~1.5 MB decoded. The console resizes to ≤800px WebP before sending. */
const MAX_BYTES = 1_500_000;
const ALLOWED = new Set(['image/webp', 'image/jpeg', 'image/png']);

const schema = z.object({
  /** data:image/webp;base64,.... */
  dataUrl: z.string().max(2_200_000),
});

/**
 * Upload a therapist photo to Firebase Storage and return its public download
 * URL (token-based, so it works without making the bucket public).
 * Requires FIREBASE_STORAGE_BUCKET (or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).
 */
export async function POST(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  if (!checkRateLimit(getClientIp(req), 'admin_therapist_photo', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many uploads in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json(
      { error: 'Photo upload is not configured (FIREBASE_STORAGE_BUCKET is not set). Paste an image URL instead.' },
      { status: 503 }
    );
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
  const contentType = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'The image must be under 1.5 MB.' }, { status: 400 });
  }

  try {
    const ext = contentType.split('/')[1];
    const path = `therapists/${crypto.randomUUID()}.${ext}`;
    const token = crypto.randomUUID();
    const bucket = getStorage().bucket(bucketName);
    await bucket.file(path).save(bytes, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    return NextResponse.json({ success: true, url });
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Therapist photo upload failed', error);
    return NextResponse.json({ error: 'The photo could not be uploaded. Please try again.' }, { status: 500 });
  }
}
