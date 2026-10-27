/**
 * Server-side account changes on Better Auth users, for the admin console and
 * therapist linking (NEXT_PUBLIC_AUTH_PROVIDER=better-auth). Under Better Auth
 * the role and ban live on the Better Auth `user` row, which verifySession
 * reads, so these are the authoritative writes; users/{uid} in Firestore is
 * kept as a mirror for the console's lists.
 *
 * Goes through Better Auth's internal adapter: the callers have already
 * verified an admin session with the app's own guards.
 */

async function adapter() {
  const { auth } = await import('./betterAuth');
  return (await auth.$context).internalAdapter;
}

export async function setBetterAuthRole(userId: string, role: 'client' | 'therapist' | 'admin'): Promise<void> {
  await (await adapter()).updateUser(userId, { role });
}

/** Banning also ends every session, so the person is signed out everywhere at once. */
export async function setBetterAuthBanned(userId: string, banned: boolean): Promise<void> {
  const a = await adapter();
  await a.updateUser(
    userId,
    banned ? { banned: true, banReason: 'Disabled by an administrator' } : { banned: false, banReason: null, banExpires: null }
  );
  if (banned) await a.deleteUserSessions(userId);
}

export async function revokeBetterAuthSessions(userId: string): Promise<void> {
  await (await adapter()).deleteUserSessions(userId);
}

export async function findBetterAuthUserIdByEmail(email: string): Promise<string | null> {
  const found = await (await adapter()).findUserByEmail(email.trim().toLowerCase());
  return found?.user.id ?? null;
}
