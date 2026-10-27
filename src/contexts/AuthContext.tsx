"use client";



import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { authService } from '../services/authService';
import { User as CustomUser } from '../types';
import { auth, db } from '../lib/firebase/client';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { syncSessionCookie, invalidateSessionSync, type SessionSyncResult } from '@/services/sessionSyncService';
import { perfMark, perfMeasure } from '@/lib/perfTracing';
import { isBetterAuth } from '@/lib/auth/provider';
import { authClient } from '@/lib/auth/authClient';

interface AuthContextType {
  currentUser: CustomUser | null;
  loading: boolean;
  /**
   * Resolves when the server session cookie has been confirmed for the
   * current user (or the user is signed out), so callers that immediately
   * depend on server-side session state (e.g. the login page's redirect to
   * middleware-protected routes) can wait for it without every consumer of
   * the auth context having to. The resolved result carries the server's own
   * sentence when it refused the session outright (e.g. a disabled account).
   */
  sessionSyncComplete: Promise<SessionSyncResult> | null;
  login: (email: string, pw: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, pw: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type Role = 'admin' | 'therapist' | 'client';

/** Role for `uid` from the existing session cookie, or null (never throws). */
async function roleFromSessionCookie(uid: string): Promise<Role | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { uid?: unknown; role?: unknown };
    if (body.uid !== uid) return null;
    return body.role === 'admin' || body.role === 'therapist' || body.role === 'client' ? body.role : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const FirebaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionSyncComplete, setSessionSyncComplete] = useState<Promise<SessionSyncResult> | null>(null);
  const router = useRouter();
  
  const isMounted = useRef(true);
  // The first auth callback restores the persisted Firebase session. It is not
  // a user navigation event, so refreshing the current route here makes public
  // pages (including the global 404) appear to reload after they render.
  // Keep the previous uid so only a real signed-out -> signed-in transition
  // refreshes server components after an explicit login.
  const previousFirebaseUid = useRef<string | null | undefined>(undefined);
  // Monotonic sequence guarding against stale/superseded auth-state events
  // (duplicate events, Strict Mode double-invoke, rapid login->logout).
  const authEventSeq = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    if (!auth) {
      setLoading(false);
      return;
    }

    perfMark('AUTH_INIT');
    
    // onAuthStateChanged automatically fires immediately with current state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const eventSeq = ++authEventSeq.current;
      const isStaleEvent = () =>
        !isMounted.current || eventSeq !== authEventSeq.current;

      try {
        perfMark('AUTH_STATE_RESTORED');
        const wasInitialAuthRestore = previousFirebaseUid.current === undefined;
        const wasSignedOut = previousFirebaseUid.current === null;
        previousFirebaseUid.current = firebaseUser?.uid ?? null;

        if (firebaseUser) {
          // If already loading, we just keep it loading until we have the role
          setLoading(true);
          // A previous user's confirmed cookie must never authorize this
          // user's login-page redirect while their role/session are resolving.
          setSessionSyncComplete(null);
          perfMark('GET_USER_ROLE_START');
          // Fast path: the server already knows the role from the session
          // cookie. Falls back to the browser's own Firestore read when there
          // is no cookie yet (first sign-in) or it belongs to someone else.
          let role =
            (await roleFromSessionCookie(firebaseUser.uid)) ??
            (await authService.getUserRole(firebaseUser.uid));
          perfMeasure('GET_USER_ROLE', 'GET_USER_ROLE_START', 'AUTH');
          
          if (isStaleEvent()) return;
          
          if (!role) {
            console.log('No user profile found in Firestore for UID:', firebaseUser.uid);
            console.log('Creating default client profile on-the-fly to prevent premature signout...');
            
            try {
              const userDocRef = doc(db, 'users', firebaseUser.uid);
              await setDoc(userDocRef, {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'User',
                email: firebaseUser.email || '',
                role: 'client',
                provider: firebaseUser.providerData[0]?.providerId || 'google',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                totalSessions: 0,
                activeBookings: 0,
                preferredTherapists: [],
                lastSessionDate: null,
              });
              console.log('✅ Default client profile successfully created in Auth state listener!');
              role = 'client';
            } catch (createErr) {
              console.error('❌ Failed to auto-create user profile in Firestore:', createErr);
              // Unrecognized role & failed to create -> hard logout
              await auth.signOut();
              await fetch('/api/auth/session', { method: 'DELETE' });
              if (isMounted.current) {
                setCurrentUser(null);
                setLoading(false);
              }
              return;
            }
          }

          // The client gate only needs Firebase auth + the verified role.
          // The server session cookie is synced in the background (below) so
          // the user-facing spinner no longer waits for that round trip.
          if (isMounted.current) {
            setCurrentUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              emailVerified: firebaseUser.emailVerified,
              role: role as 'admin' | 'therapist' | 'client',
              name: firebaseUser.displayName || undefined
            });
            setLoading(false);
            perfMark('AUTH_READY');
            perfMeasure('AUTH_READY', 'AUTH_INIT', 'AUTH');
            if (!wasInitialAuthRestore && wasSignedOut) {
              router.refresh();
            }
          }

          // Background session-cookie synchronization (never blocks the gate).
          // The token itself is fetched inside the sync service and is never
          // held by the context.
          perfMark('SESSION_SYNC_START');
          if (isStaleEvent()) {
            // Identity changed while we awaited the role: drop this sync.
            invalidateSessionSync();
            return;
          }
          const syncPromise = syncSessionCookie(firebaseUser);
          setSessionSyncComplete(syncPromise);
          void syncPromise.then((result) => {
            perfMeasure('SESSION_SYNC_END', 'SESSION_SYNC_START', 'AUTH');
            if (!result.ok) {
              // The cookie could not be synced. Client state stays valid
              // (Firebase auth governs it), but middleware/API calls will
              // bounce until a later sync succeeds — e.g. the next auth
              // event or an explicit re-login. A terminal refusal (the
              // server's own sentence, e.g. a disabled account) is carried
              // on the result for the login screen to show verbatim.
              console.warn('Background session sync did not complete.', result.status);
            }
          });
        } else {
          invalidateSessionSync();
          setSessionSyncComplete(null);
          await fetch('/api/auth/session', { method: 'DELETE' });
          if (isMounted.current) {
            setCurrentUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Auth state change error', err);
        invalidateSessionSync();
        await fetch('/api/auth/session', { method: 'DELETE' });
        if (isMounted.current) {
          setCurrentUser(null);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [router]);

  const login = async (email: string, pw: string) => {
    setLoading(true);
    try {
      await authService.login(email, pw);
      // onAuthStateChanged will detect the new user, fetch role, update currentUser, and setLoading(false)
    } catch (error) {
      if (isMounted.current) setLoading(false);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      await authService.loginWithGoogle();
    } catch (error) {
      if (isMounted.current) setLoading(false);
      throw error;
    }
  };

  const register = async (email: string, pw: string, name: string) => {
    setLoading(true);
    try {
      await authService.register(email, pw, name);
    } catch (error) {
      if (isMounted.current) setLoading(false);
      throw error;
    }
  };

  const logout = useCallback(async () => {
    setLoading(true);
    // Invalidate any in-flight/retrying background sync immediately: no
    // post-logout retry may re-establish a cookie for the signed-out user.
    invalidateSessionSync();
    setSessionSyncComplete(null);
    try {
      await authService.logout();
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch (error) {
      console.error('Logout error', error);
    } finally {
      if (isMounted.current) {
        setCurrentUser(null);
        setLoading(false);
      }
      // Leave the protected route deliberately instead of leaving the user
      // parked on it while the middleware/ProtectedRoute guards fight over
      // where to send them. `replace` (not push) drops the now-unauthenticated
      // URL from history, so Back never re-enters it — and because the
      // destination is the public home, the history entry the user returns to
      // is a real page rather than a redirect back into /login.
      router.replace('/');
    }
  }, [router]);

  return (
    <AuthContext.Provider value={{ currentUser, loading, sessionSyncComplete, login, loginWithGoogle, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

function toRole(role: unknown): Role {
  return role === 'admin' || role === 'therapist' ? role : 'client';
}

/** Server session cookies are set by Better Auth itself; nothing to sync. */
const SESSION_READY: SessionSyncResult = { ok: true, status: 200, refusedMessage: null };

/**
 * NEXT_PUBLIC_AUTH_PROVIDER=better-auth: the session comes from Better Auth's
 * cookie via useSession(), which refreshes itself after sign-in and sign-out.
 * Same context shape as the Firebase provider, so no consumer changes.
 */
const BetterAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data, isPending } = authClient.useSession();
  const [actionPending, setActionPending] = useState(false);
  const router = useRouter();
  const user = data?.user;

  const currentUser = useMemo<CustomUser | null>(
    () =>
      user && !user.banned
        ? { uid: user.id, email: user.email, emailVerified: user.emailVerified, role: toRole(user.role), name: user.name || undefined }
        : null,
    [user]
  );
  const uid = currentUser?.uid;
  const sessionSyncComplete = useMemo(() => (uid ? Promise.resolve(SESSION_READY) : null), [uid]);

  // Server components read the session too; refresh them when it changes.
  const previousUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (isPending) return;
    const next = uid ?? null;
    if (previousUid.current !== undefined && previousUid.current !== next) router.refresh();
    previousUid.current = next;
  }, [uid, isPending, router]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setActionPending(true);
    try {
      await action();
    } finally {
      setActionPending(false);
    }
  }, []);

  const login = useCallback((email: string, pw: string) => run(() => authService.login(email, pw)), [run]);
  // Leaves the page for Google; nothing to reset on success.
  const loginWithGoogle = useCallback(() => run(() => authService.loginWithGoogle()), [run]);
  const register = useCallback((email: string, pw: string, name: string) => run(() => authService.register(email, pw, name)), [run]);
  const logout = useCallback(async () => {
    try {
      await run(() => authService.logout());
    } catch (error) {
      console.error('Logout error', error);
    } finally {
      router.replace('/');
    }
  }, [run, router]);

  return (
    <AuthContext.Provider value={{ currentUser, loading: isPending || actionPending, sessionSyncComplete, login, loginWithGoogle, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = isBetterAuth() ? BetterAuthProvider : FirebaseAuthProvider;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
