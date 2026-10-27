import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { isBetterAuth } from '@/lib/auth/provider';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' };
const LIMITS = { name: 100, phone: 20, bio: 1000 } as const;

/**
 * The signed-in person's editable profile (name, phone, bio) from
 * users/{uid}, for the dashboard and profile pages. Under Better Auth the
 * browser has no Firestore identity, so it reads and writes through here.
 *
 * GET also says whether the account signs in with a password (so the page
 * knows whether to offer a reset link) and, when the profile is empty, falls
 * back to the details on the person's most recent booking under their
 * verified email, as the page did before.
 */

async function usesPassword(req: Request, uid: string): Promise<boolean> {
  try {
    if (isBetterAuth()) {
      const { auth } = await import('@/lib/auth/betterAuth');
      const accounts = await auth.api.listUserAccounts({ headers: req.headers });
      return accounts.some((a) => a.providerId === 'credential');
    }
    const user = await adminAuth.getUser(uid);
    return user.providerData.some((p) => p.providerId === 'password');
  } catch {
    return false;
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function GET(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE });

  try {
    const [snap, password] = await Promise.all([adminDb.collection('users').doc(session.uid).get(), usesPassword(req, session.uid)]);
    const data = snap.exists ? snap.data() ?? {} : {};
    let name = text(data.name);
    let phone = text(data.phone);

    if (!name && !phone && session.email) {
      const bookings = await adminDb.collection('bookings').where('email', '==', session.email.toLowerCase()).limit(50).get();
      const latest = bookings.docs
        .map((d) => d.data())
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0];
      name = text(latest?.name);
      phone = text(latest?.phone);
    }

    return NextResponse.json({ name, phone, bio: text(data.bio), usesPassword: password }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error('FIRESTORE', 'Could not load profile', { uid: session.uid, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'We could not load your profile just now.' }, { status: 500, headers: PRIVATE_NO_STORE });
  }
}

export async function PATCH(req: Request) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_NO_STORE });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const fields = { name: body?.name, phone: body?.phone, bio: body?.bio };
  const update: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields) as Array<[keyof typeof LIMITS, unknown]>) {
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length > LIMITS[key]) {
      return NextResponse.json({ error: `Please check your ${key}.` }, { status: 400, headers: PRIVATE_NO_STORE });
    }
    update[key] = value.trim();
  }

  try {
    await adminDb
      .collection('users')
      .doc(session.uid)
      .set({ ...update, updatedAt: new Date().toISOString() }, { merge: true });

    // Keep the account's display name in step so the header matches.
    if (isBetterAuth() && update.name) {
      try {
        const { auth } = await import('@/lib/auth/betterAuth');
        await auth.api.updateUser({ headers: req.headers, body: { name: update.name } });
      } catch {
        /* non-fatal: users/{uid} is the source of truth for display */
      }
    }

    return NextResponse.json({ ok: true }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error('FIRESTORE', 'Could not save profile', { uid: session.uid, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'We could not save your details.' }, { status: 500, headers: PRIVATE_NO_STORE });
  }
}
