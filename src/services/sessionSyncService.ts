/**
 * Background `__session` cookie synchronization.
 *
 * The client auth context needs only the Firebase session plus the Firestore
 * role to render the UI. The server session cookie (a JWT signed by
 * /api/auth/session) is required for middleware and API authorization, but
 * that synchronization does not need to block the auth gate — so it runs here,
 * in the background, with explicit failure semantics:
 *
 * - Dedupe: one in-flight sync per uid; repeated auth-state events for the
 *   same recently-synced user do not re-POST.
 * - Retry: bounded (MAX_SYNC_RETRIES) with fixed backoff — no infinite loops.
 * - Invalidation: logout or a user switch bumps a generation counter, and any
 *   in-flight/retrying sync for the superseded identity stops silently.
 *
 * The server remains authoritative: this module only relays a Firebase ID
 * token to /api/auth/session, which verifies it with Firebase Admin. A failed
 * sync never grants or withholds client-side state — it only means protected
 * server-side operations (middleware/API) will redirect or 401 until the
 * next successful sync.
 */

export interface SyncableFirebaseUser {
  uid: string;
  email?: string | null;
  getIdToken(force?: boolean): Promise<string>;
}

const MAX_SYNC_RETRIES = 2;
const RETRY_DELAY_MS = [800, 2000];
/** Repeated auth-state events for the same user within this window are no-ops. */
const DEDUPE_WINDOW_MS = 60_000;

interface InflightSync {
  uid: string;
  promise: Promise<boolean>;
}

let inflight: InflightSync | null = null;
/** Monotonic generation; bumped whenever the synced identity becomes stale. */
let generation = 0;
/** Last successfully synced identity and when, for the dedupe window. */
let lastSyncedUid: string | null = null;
let lastSyncedAt = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postSession(idToken: string): Promise<{ ok: boolean; status: number }> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  return { ok: response.ok, status: response.status };
}

/**
 * Synchronize the server session cookie for `user`. Resolves true when the
 * server confirmed (and the cookie is fresh), false when every attempt failed
 * or the sync was invalidated mid-flight (logout / account switch).
 *
 * Concurrent calls for the same uid share one network effort.
 */
export function syncSessionCookie(user: SyncableFirebaseUser): Promise<boolean> {
  // Same user already syncing: everyone waits on that single effort.
  if (inflight && inflight.uid === user.uid) {
    return inflight.promise;
  }

  // A different user is syncing: their identity is now stale — invalidate so
  // their retry loop stops, then proceed with the new user.
  if (inflight && inflight.uid !== user.uid) {
    invalidateSessionSync();
  }

  // Recently synced for this same user: skip the duplicate POST. (Real
  // re-authentication flows always pass through sign-out or a new uid first,
  // which resets this bookkeeping via invalidateSessionSync or a new sync.)
  if (lastSyncedUid === user.uid && Date.now() - lastSyncedAt < DEDUPE_WINDOW_MS) {
    return Promise.resolve(true);
  }

  const syncGeneration = ++generation;
  const promise = (async (): Promise<boolean> => {
    for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
      try {
        const idToken = await user.getIdToken();
        // Bail out if the identity was invalidated while we awaited the token.
        if (generation !== syncGeneration) return false;

        const result = await postSession(idToken);
        if (generation !== syncGeneration) return false;

        if (result.ok) {
          lastSyncedUid = user.uid;
          lastSyncedAt = Date.now();
          return true;
        }

        // 4xx client errors will not improve on retry (e.g. an invalid token —
        // which re-authentication, not retrying, fixes). Retry only 5xx and
        // network failures below.
        if (result.status >= 400 && result.status < 500) {
          return false;
        }
      } catch {
        // Network error: fall through to retry decision.
      }

      const isLastAttempt = attempt === MAX_SYNC_RETRIES;
      if (isLastAttempt || generation !== syncGeneration) {
        return false;
      }
      await delay(RETRY_DELAY_MS[attempt]);
      if (generation !== syncGeneration) return false;
    }
    return false;
  })();

  inflight = { uid: user.uid, promise };

  const tracked = promise.finally(() => {
    if (inflight && inflight.uid === user.uid) {
      inflight = null;
    }
  });

  // Return the tracked promise so callers observe completion, but keep the
  // un-tracked `promise` inside `inflight` for sharing between callers.
  return tracked;
}

/**
 * Invalidate any in-flight or recently-remembered sync state. Called on
 * logout and (implicitly) on user switch. In-flight attempts stop silently at
 * their next generation check; the cookie itself is cleared by the caller
 * via DELETE /api/auth/session.
 */
export function invalidateSessionSync(): void {
  generation++;
  inflight = null;
  lastSyncedUid = null;
  lastSyncedAt = 0;
}

/** Test-only: reset all module state. */
export function resetSessionSyncForTests(): void {
  invalidateSessionSync();
}
