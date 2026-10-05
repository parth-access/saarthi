import crypto from 'crypto';

/**
 * Constant-time comparison for HMAC digests / signatures.
 *
 * The previously-used `generated !== provided` string compare leaks, through
 * timing, how many leading characters of a candidate signature match —
 * theoretical over a network, but free to eliminate. Both inputs are compared
 * as UTF-8 buffers; unequal lengths return false immediately (length itself is
 * not a secret for a fixed-digest scheme, and timingSafeEqual requires equal
 * lengths).
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
