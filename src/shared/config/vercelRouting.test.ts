import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the Vercel project configuration against the exact production
 * incident this file was created after:
 *
 * A SPA-era catch-all rewrite (`/(.*) -> /index.html`) lived in vercel.json.
 * On Vercel, project-level rewrites run against Next.js *dynamic* page routes
 * (which resolve after the rewrite stack) while static pages and API routes
 * are matched earlier — so every dynamic page 404'd in production
 * (`/admin/bookings/[bookingId]`, `/therapist/bookings/[bookingId]`,
 * `/admin/therapists/[therapistId]`) while `/`, `/admin/bookings`,
 * `/dashboard` and `/api/*` kept working. The rewrite target `/index.html`
 * does not even exist in this Next.js build.
 *
 * Vercel's own guidance for Next.js projects: routing belongs in
 * next.config.ts; a vercel.json and next.config.js routing conflict "creates
 * conflicts where the vercel.json rules override or interfere with the
 * framework's own routing manifest".
 */

const ROOT = join(__dirname, '..', '..', '..');
const vercelJson = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));

describe('vercel.json routing safety', () => {
  it('does not declare any rewrites (routing belongs to next.config.ts)', () => {
    // If a rewrite is ever genuinely needed, it must go through next.config.ts
    // so it composes with the framework's routing manifest instead of
    // shadowing dynamic page routes. Re-adding rewrites here reintroduces the
    // production 404 on every dynamic page.
    expect(vercelJson.rewrites).toBeUndefined();
  });

  it('keeps CDN headers in place (they are the maintained part of this file)', () => {
    expect(Array.isArray(vercelJson.headers)).toBe(true);
    expect(vercelJson.headers.length).toBeGreaterThan(0);
  });

  it('does not reference a non-existent /index.html fallback target', () => {
    const serialized = JSON.stringify(vercelJson);
    expect(serialized).not.toContain('index.html');
  });
});
