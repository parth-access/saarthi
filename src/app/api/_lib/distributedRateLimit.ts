import crypto from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { checkRateLimit } from './rateLimit';

export interface DistributedRateLimitResult {
  success: boolean;
  /** Which store made the decision — 'firestore' is shared across all instances. */
  store: 'firestore' | 'memory';
}

/**
 * SHARED rate limiter for the small set of security-sensitive, low-volume
 * endpoints (email dispatch, payment-failure reports, session creation).
 *
 * The default limiter (`checkRateLimit`) is an in-memory per-instance throttle:
 * Vercel fans requests across serverless instances, so its effective ceiling is
 * `limit × instance_count` and cold starts reset counters. This limiter keeps
 * the counter in Firestore (`rate_limits/{route}_{ipHash}`) inside a
 * transaction, so the limit is enforced globally across every instance.
 *
 * Trade-offs, deliberate:
 *  - one Firestore transaction per request — acceptable only because the
 *    endpoints using it are low-volume; high-volume endpoints (availability,
 *    public reads) stay on the in-memory limiter;
 *  - the IP is stored only as a salted hash, never in plaintext;
 *  - on any Firestore failure the limiter fails OPEN to the per-instance
 *    bucket: this is an abuse throttle, not a security boundary, and endpoint
 *    availability must not depend on the counter store.
 *
 * GARBAGE COLLECTION: every counter doc carries `expireAt` (a Date, one
 * window ahead). Enable a Firestore TTL policy on `rate_limits.expireAt`
 * (Firebase console → Firestore → Data → TTL policy) so stale counters are
 * deleted automatically; without it the collection accumulates one doc per
 * unique route+visitor. TTL deletions are free of read/write costs.
 */
export async function checkDistributedRateLimit(
  ip: string,
  route: string,
  limit: number,
  windowMs: number
): Promise<DistributedRateLimitResult> {
  // Cheap per-instance early-out keeps obvious floods off Firestore.
  const memory = checkRateLimit(ip, route, limit, windowMs);
  if (!memory.success) {
    return { success: false, store: 'memory' };
  }

  if (!adminDb || typeof adminDb.runTransaction !== 'function') {
    return { success: memory.success, store: 'memory' };
  }

  const ipHash = crypto.createHash('sha256').update(`${route}:${ip}`).digest('hex').slice(0, 32);
  const docId = `${route}_${ipHash}`;

  try {
    const allowed = await adminDb.runTransaction(async (t) => {
      const ref = adminDb.collection('rate_limits').doc(docId);
      const snap = await t.get(ref);
      const now = Date.now();

      if (!snap.exists) {
        t.set(ref, { route, count: 1, windowStart: now, expireAt: new Date(now + windowMs) });
        return true;
      }

      const data = snap.data() || {};
      const windowStart = Number(data.windowStart) || 0;
      const count = Number(data.count) || 0;

      if (now - windowStart >= windowMs) {
        t.set(ref, { route, count: 1, windowStart: now, expireAt: new Date(now + windowMs) });
        return true;
      }

      if (count >= limit) {
        return false;
      }

      t.update(ref, { count: count + 1 });
      return true;
    });

    return { success: allowed, store: 'firestore' };
  } catch (err) {
    console.warn('[RateLimit] Shared limiter unavailable; falling back to per-instance bucket', err);
    return { success: memory.success, store: 'memory' };
  }
}
