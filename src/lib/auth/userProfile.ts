import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase/admin';

/**
 * Creates the Firestore `users/{uid}` profile for a new Better Auth account.
 * Bookings, phone, bio and dashboard counters still live there; with Firebase
 * Auth the browser wrote it on first sign-in, but Better Auth's browser has no
 * Firestore access, so the server does it when the account is created.
 *
 * Never overwrites an existing profile, and never throws: a failed write must
 * not fail the sign-up (the dashboard treats a missing profile as empty).
 */
export async function createUserProfile(user: { id: string; email: string; name?: string | null }, provider: string): Promise<void> {
  try {
    await adminDb.collection('users').doc(user.id).create({
      uid: user.id,
      name: user.name?.trim() || 'User',
      email: user.email,
      role: 'client',
      provider,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      totalSessions: 0,
      activeBookings: 0,
      preferredTherapists: [],
      lastSessionDate: null,
    });
  } catch (err) {
    // gRPC ALREADY_EXISTS: the profile is already there, which is fine.
    if ((err as { code?: unknown })?.code === 6) return;
    console.error('Could not create Firestore profile for new user', user.id, err instanceof Error ? err.message : err);
  }
}
