/**
 * Background `__session` cookie synchronization.
 *
 * The client auth context needs only the Firebase session plus the Firestore
 * role to render the UI. The server session cookie (a JWT signed by
 * /api/auth/session) is required for middleware and API authorization, but
 * that synchronization does not need to block the auth gate — so it runs here,
 * in the background, with explicit failure semantics:
 *
 * - Dedupe: one in-flight sync per uid. A completed POST is not cached:
 *   middleware may subsequently clear an expired or invalid cookie.
 * - Retry: bounded (MAX_SYNC_RETRIES) with fixed backoff — no infinite loops.
 * - Invalidation: logout or a user switch bumps a generation counter, and any
 *   in-flight/retrying sync for the superseded identity stops silently.
 * - Terminal refusals: a 4xx that carries the server's own sentence (e.g. a
 *   disabled account) is surfaced to the caller verbatim — it will never
 *   improve on retry, so the user must be told rather than bounced.
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

export interface SessionSyncResult {
  /** True when the server confirmed and the cookie is fresh. */
  ok: boolean;
  /** HTTP status of the last mint attempt; null when the network failed first. */
  status: number | null;
  /**
   * The server's own sentence for a terminal refusal — currently a disabled
   * account. Non-null only for 4xx responses that carried an explanation;
   * those do not improve on retry, so the UI shows them instead of looping.
   */
  refusedMessage: string | null;
}

const MAX_SYNC_RETRIES = 2;
const RETRY_DELAY_MS = [800, 2000];

interface InflightSync {
  uid: string;
  promise: Promise<SessionSyncResult>;
}

let inflight: InflightSync | null = null;
/** Monotonic generation; bumped whenever the synced identity becomes stale. */
let generation = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postSession(
  idToken: string
): Promise<SessionSyncResult> {
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  let refusedMessage: string | null = null;
  if (!response.ok && response.status >= 400 && response.status < 500) {
    try {
      const body = (await response.json()) as { error?: unknown } | null;
      refusedMessage =
        body && typeof body.error === 'string' && body.error ? body.error : null;
    } catch {
      refusedMessage = null;
    }
  }
  return { ok: response.ok, status: response.status, refusedMessage };
}

/**
 * Synchronize the server session cookie for `user`. Resolves the result of
 * the last attempt: `ok` when the server confirmed (and the cookie is fresh);
 * `refusedMessage` carries the server's sentence when it refused the session
 * outright. Concurrent calls for the same uid share one network effort.
 */
export function syncSessionCookie(user: SyncableFirebaseUser): Promise<SessionSyncResult> {
  // Same user already syncing: everyone waits on that single effort.
  if (inflight && inflight.uid === user.uid) {
    return inflight.promise;
  }

  // A different user is syncing: their identity is now stale — invalidate so
  // their retry loop stops, then proceed with the new user.
  if (inflight && inflight.uid !== user.uid) {
    invalidateSessionSync();
  }

  const syncGeneration = ++generation;
  const promise = (async (): Promise<SessionSyncResult> => {
    for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt++) {
      try {
        const idToken = await user.getIdToken();
        // Bail out if the identity was invalidated while we awaited the token.
        if (generation !== syncGeneration) return { ok: false, status: null, refusedMessage: null };

        const result = await postSession(idToken);
        if (generation !== syncGeneration) return { ok: false, status: null, refusedMessage: null };

        if (result.ok) {
          return result;
        }

        // 4xx client errors will not improve on retry (e.g. an invalid token —
        // which re-authentication, not retrying, fixes). Retry only 5xx and
        // network failures below.
        if (result.status !== null && result.status >= 400 && result.status < 500) {
          return result;
        }
      } catch {
        // Network error: fall through to retry decision.
      }

      const isLastAttempt = attempt === MAX_SYNC_RETRIES;
      if (isLastAttempt || generation !== syncGeneration) {
        return { ok: false, status: null, refusedMessage: null };
      }
      await delay(RETRY_DELAY_MS[attempt]);
      if (generation !== syncGeneration) return { ok: false, status: null, refusedMessage: null };
    }
    return { ok: false, status: null, refusedMessage: null };
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
 * Invalidate any in-flight sync state. Called on
 * logout and (implicitly) on user switch. In-flight attempts stop silently at
 * their next generation check; the cookie itself is cleared by the caller
 * via DELETE /api/auth/session.
 */
export function invalidateSessionSync(): void {
  generation++;
  inflight = null;
}

/** Test-only: reset all module state. */
export function resetSessionSyncForTests(): void {
  invalidateSessionSync();
}
