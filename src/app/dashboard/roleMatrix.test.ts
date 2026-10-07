import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The role matrix, pinned at the source: every dashboard page must admit all
 * three authenticated roles (the dashboard is each role's own personal space),
 * the admin console stays admin-only, and the therapist portal stays
 * therapist-only (an admin visiting it is bounced to /admin — existing
 * behavior). A new dashboard page that forgets the roles fails here instead of
 * bouncing therapists one click deeper than the page they landed on.
 *
 * Data ownership is enforced SERVER-side by the Firestore rules, not by this
 * client query: a signed-in user may read a booking only when its email
 * matches their token email or its userId matches their uid. That clause is
 * pinned too, because "the dashboard only ever shows the signed-in person's
 * data" rests on it.
 */
const DASHBOARD_DIR = join(process.cwd(), 'src/app/dashboard');

function dashboardPageFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(DASHBOARD_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') out.push(join(DASHBOARD_DIR, 'page.tsx'));
    if (entry.isDirectory()) {
      const nested = join(DASHBOARD_DIR, entry.name, 'page.tsx');
      try {
        readFileSync(nested);
        out.push(nested);
      } catch {
        // directory without a page — nothing to pin
      }
    }
  }
  return out;
}

describe('dashboard role matrix agreement', () => {
  it('admits client, therapist and admin on every dashboard page', () => {
    for (const file of dashboardPageFiles()) {
      const src = readFileSync(file, 'utf8');
      const match = /allowedRoles=\{\[([^\]]*)\]\}/.exec(src);
      expect(match, `${file} has no ProtectedRoute role declaration`).not.toBeNull();
      const declared = match?.[1] ?? '';
      for (const role of ['client', 'admin', 'therapist']) {
        expect(declared, `${file} must allow ${role}`).toContain(role);
      }
    }
  });

  it('keeps the admin console admin-only', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/admin/layout.tsx'), 'utf8');
    expect(src).toMatch(/allowedRoles=\{\['admin'\]\}/);
  });

  it('keeps the therapist portal therapist-only (admin bounces to /admin, as today)', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/therapist/layout.tsx'), 'utf8');
    expect(src).toMatch(/allowedRoles=\{\['therapist'\]\}/);
  });
});

describe('firestore.rules agreement: bookings are readable only by their own client', () => {
  const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
  const bookingsBlock = rules.slice(
    rules.indexOf('match /bookings/'),
    rules.indexOf('allow write: if false')
  );

  it('scopes booking reads to the signed-in identity (email or uid), not just the query', () => {
    expect(bookingsBlock).toContain('resource.data.email == request.auth.token.email');
    expect(bookingsBlock).toContain('resource.data.userId == request.auth.uid');
  });

  it('never opens booking reads to any signed-in user', () => {
    // The client arm of the read rule must be conjunctive: isSignedIn() AND an
    // ownership match — never a bare isSignedIn().
    expect(bookingsBlock).not.toMatch(/allow read, list: if\s+isSignedIn\(\);/);
  });
});
