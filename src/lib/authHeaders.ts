import { auth } from '@/lib/firebase/client';
import { isBetterAuth } from '@/lib/auth/provider';

/**
 * Headers that authenticate an API call as the signed-in user.
 *
 * Firebase: a Bearer ID token, or null when nobody is signed in (callers show
 * their own "please sign in" message). Better Auth: nothing to add, since the
 * session cookie travels with every same-origin fetch; the API route decides.
 */
export async function authHeaders(): Promise<Record<string, string> | null> {
  if (isBetterAuth()) return {};
  const user = auth?.currentUser;
  if (!user) return null;
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}
