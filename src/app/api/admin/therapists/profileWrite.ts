import 'server-only';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { TherapistProfileInput } from './profileSchema';

/** Fields of a therapist document this console's profile editor owns. */
export const PROFILE_FIELDS = [
  'name',
  'slug',
  'specialization',
  'experience',
  'bio',
  'image',
  'email',
  'authId',
  'sessionPrice',
  'inPersonPrice',
  'payoutPercent',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileDoc = Partial<Record<ProfileField, string | number | null>>;

export class ProfileConflictError extends Error {}

/** Slug must be unique across therapists (it is the public profile URL). */
export async function assertSlugFree(slug: string | null | undefined, exceptId?: string): Promise<void> {
  if (!slug) return;
  const snap = await adminDb.collection('therapists').where('slug', '==', slug).limit(2).get();
  const clash = snap.docs.find((d) => d.id !== exceptId);
  if (clash) throw new ProfileConflictError(`The slug "${slug}" is already used by another therapist.`);
}

/**
 * Resolve the sign-in account for `loginEmail`. The therapist's account may not
 * exist yet; then the email is stored and the link is made on a later save.
 * An account already linked to a different therapist is refused.
 */
export async function resolveAuthLink(
  loginEmail: string | null | undefined,
  exceptId?: string
): Promise<{ email: string | null; authId: string | null; linked: boolean }> {
  if (!loginEmail) return { email: null, authId: null, linked: false };
  let uid: string | null = null;
  try {
    uid = (await adminAuth.getUserByEmail(loginEmail)).uid;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') throw err;
  }
  if (uid) {
    const snap = await adminDb.collection('therapists').where('authId', '==', uid).limit(2).get();
    const clash = snap.docs.find((d) => d.id !== exceptId);
    if (clash) throw new ProfileConflictError('That sign-in account is already linked to another therapist.');
  }
  return { email: loginEmail, authId: uid, linked: uid !== null };
}

/** Map validated input to document fields (only keys present in the input). */
export function toProfileDoc(
  input: TherapistProfileInput,
  link: { email: string | null; authId: string | null } | null
): ProfileDoc {
  const doc: ProfileDoc = { name: input.name };
  if (input.slug !== undefined) doc.slug = input.slug;
  if (input.specialization !== undefined) doc.specialization = input.specialization;
  if (input.experience !== undefined) doc.experience = input.experience;
  if (input.bio !== undefined) doc.bio = input.bio;
  if (input.image !== undefined) doc.image = input.image;
  if (input.sessionPrice !== undefined) doc.sessionPrice = input.sessionPrice;
  if (input.inPersonPrice !== undefined) doc.inPersonPrice = input.inPersonPrice;
  if (input.payoutPercent !== undefined) doc.payoutPercent = input.payoutPercent;
  if (link) {
    doc.email = link.email;
    // Never unlink an existing account just because it has not signed up yet.
    if (link.authId || link.email === null) doc.authId = link.authId;
  }
  return doc;
}

export function pickProfile(data: Record<string, unknown>): ProfileDoc {
  const out: ProfileDoc = {};
  for (const key of PROFILE_FIELDS) {
    const v = data[key];
    out[key] = typeof v === 'string' || typeof v === 'number' ? v : null;
  }
  return out;
}
