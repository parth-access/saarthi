import { auth } from '@/lib/firebase/client';
import { isBetterAuth } from '@/lib/auth/provider';

/**
 * The signed-in person's editable profile. Under Firebase the browser reads
 * and writes users/{uid} itself; under Better Auth it has no Firestore
 * identity, so it goes through /api/me/profile. Same shape either way.
 *
 * The Firestore SDK is imported on first use of the Firebase path only, so it
 * never ships to pages that read through the API.
 */
const loadFirestore = () =>
  Promise.all([import('firebase/firestore'), import('@/lib/firebase/firestore')]).then(([sdk, mod]) => ({ ...sdk, db: mod.db }));

export interface ProfileData {
  name: string;
  phone: string;
  bio: string;
  /** The account signs in with a password, so a reset link makes sense. */
  usesPassword: boolean;
}

export interface ProfileUser {
  uid: string;
  email: string;
}

async function loadFromFirestore(user: ProfileUser): Promise<ProfileData> {
  const { doc, getDoc, collection, query, where, getDocs, db } = await loadFirestore();
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  const data = userDoc.exists() ? userDoc.data() : {};
  let name: string = data.name || '';
  let phone: string = data.phone || '';

  // Fall back to the details on the user's most recent booking so the form
  // isn't blank for people who booked before ever opening the profile page.
  if (!name && !phone && user.email) {
    const snap = await getDocs(query(collection(db, 'bookings'), where('email', '==', user.email)));
    const latest = snap.docs
      .map((d) => d.data() as { name?: string; phone?: string; createdAt?: { seconds: number } })
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
    name = latest?.name || '';
    phone = latest?.phone || '';
  }

  return {
    name,
    phone,
    bio: data.bio || '',
    usesPassword: (auth?.currentUser?.providerData || []).some((p) => p.providerId === 'password'),
  };
}

async function saveToFirestore(user: ProfileUser, fields: Omit<ProfileData, 'usesPassword'>): Promise<void> {
  const { doc, setDoc, db } = await loadFirestore();
  await setDoc(
    doc(db, 'users', user.uid),
    { ...fields, email: user.email, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  // Keep the Firebase Auth display name in step so the header/avatar match.
  if (auth?.currentUser && fields.name && auth.currentUser.displayName !== fields.name) {
    try {
      const { updateProfile } = await import('firebase/auth');
      await updateProfile(auth.currentUser, { displayName: fields.name });
    } catch {
      /* non-fatal: the Firestore profile is the source of truth for display */
    }
  }
}

export const profileService = {
  load: async (user: ProfileUser): Promise<ProfileData> => {
    if (!isBetterAuth()) return loadFromFirestore(user);
    const res = await fetch('/api/me/profile', { cache: 'no-store' });
    if (!res.ok) throw new Error(`GET /api/me/profile ${res.status}`);
    return (await res.json()) as ProfileData;
  },

  save: async (user: ProfileUser, fields: Omit<ProfileData, 'usesPassword'>): Promise<void> => {
    if (!isBetterAuth()) return saveToFirestore(user, fields);
    const res = await fetch('/api/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(`PATCH /api/me/profile ${res.status}`);
  },
};
