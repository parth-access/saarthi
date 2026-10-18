import { adminDb } from '@/lib/firebase/admin';

/**
 * Public therapist photo, stored in Firestore by the admin upload route.
 * Photo ids are random and a photo is never changed in place (a new upload
 * gets a new id), so responses are cached forever at the CDN and in browsers.
 */
const ID = /^[0-9a-f-]{36}$/;

export async function GET(_req: Request, context: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await context.params;
  if (!ID.test(photoId)) return new Response('Not found', { status: 404 });

  try {
    const snap = await adminDb.collection('therapist_photos').doc(photoId).get();
    const data = snap.data();
    if (!snap.exists || !data?.data) return new Response('Not found', { status: 404 });

    const raw = data.data as Buffer | Uint8Array | { toUint8Array?: () => Uint8Array };
    const bytes =
      raw instanceof Uint8Array ? raw : typeof raw.toUint8Array === 'function' ? raw.toUint8Array() : null;
    if (!bytes) return new Response('Not found', { status: 404 });

    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': typeof data.contentType === 'string' ? data.contentType : 'image/webp',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Unavailable', { status: 503 });
  }
}
