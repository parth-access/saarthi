import { Resend } from 'resend';

let client: Resend | null = null;

/**
 * Lazily constructs the Resend client on first use.
 *
 * Route modules must never instantiate Resend at module scope: Next.js collects
 * page data for every route at build time, so `new Resend(undefined)` crashes
 * `next build` in any environment where RESEND_API_KEY is not locally injected.
 * With this helper, importing a route is always safe; a missing key becomes a
 * clear configuration error raised at send time (caught by the route's normal
 * error handling) instead of a build failure or a silently dropped email.
 */
export function getResendClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    client = new Resend(apiKey);
  }
  return client;
}
