interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitRecord>();

/**
 * Derives the rate-limiting identity from the request.
 *
 * `x-forwarded-for` may contain client-appended entries; the RIGHTMOST value is
 * the one added by the trusted edge (Vercel's platform proxy), so it is used as
 * the bucket key. Leftmost values are client-spoofable and would let an
 * attacker rotate buckets per request.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const entries = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (entries.length > 0) {
      return entries[entries.length - 1];
    }
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * In-memory sliding window rate limiter for API routes.
 * @param ip Client IP address
 * @param route Identifier for the rate-limited endpoint
 * @param limit Maximum allowed requests within the window
 * @param windowMs Time window in milliseconds (default: 60,000ms / 1 min)
 *
 * NOTE: this is a per-serverless-instance throttle, not a distributed control —
 * Vercel fans requests across instances and cold starts reset counters, so the
 * effective ceiling is `limit × instance_count`. It blunts obvious abuse; it is
 * not a security boundary. See the post-audit remediation notes for the
 * distributed (shared-store) option if stronger limiting is ever required.
 */
export function checkRateLimit(
  ip: string,
  route: string,
  limit: number = 10,
  windowMs: number = 60000
): { success: boolean; limit: number; remaining: number; reset: number } {
  const key = `${route}:${ip}`;
  const now = Date.now();
  const record = store.get(key);

  // Periodic cleanup of expired entries (every 100 requests)
  if (Math.random() < 0.01) {
    for (const [k, v] of store.entries()) {
      if (v.resetTime < now) {
        store.delete(k);
      }
    }
  }

  if (!record || now > record.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: Math.ceil((now + windowMs) / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset: Math.ceil(record.resetTime / 1000),
    };
  }

  record.count++;
  return {
    success: true,
    limit,
    remaining: limit - record.count,
    reset: Math.ceil(record.resetTime / 1000),
  };
}
