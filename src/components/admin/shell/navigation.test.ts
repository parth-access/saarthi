import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_NAV, ADMIN_NAV_ITEMS, resolveAdminNavItem } from './navigation';

/**
 * The navigation model is the console's only map, so these are invariants about
 * the map matching the territory rather than assertions about rendering.
 *
 * The pair that earns its keep is the two directions of nav↔route agreement: a
 * nav entry with no page is a link straight to a 404, and a page with no nav
 * entry is a screen an operator can only reach by typing the URL. Both are
 * invisible in a component test and both are one careless rename away.
 */
const ADMIN_APP_DIR = join(process.cwd(), 'src/app/admin');

/** Route paths Next.js actually serves under /admin, derived from the filesystem. */
function discoverAdminRoutes(dir = ADMIN_APP_DIR, routePrefix = '/admin'): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') {
      routes.push(routePrefix);
      continue;
    }
    if (!entry.isDirectory()) continue;
    // `(group)` segments organise files without contributing a URL segment.
    const isRouteGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
    routes.push(
      ...discoverAdminRoutes(
        join(dir, entry.name),
        isRouteGroup ? routePrefix : `${routePrefix}/${entry.name}`
      )
    );
  }
  return routes;
}

describe('admin navigation model', () => {
  it('gives every section a distinct route', () => {
    const hrefs = ADMIN_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('describes every section in operator terms', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(item.label.length, item.href).toBeGreaterThan(0);
      expect(item.purpose.length, item.href).toBeGreaterThan(0);
      // Named data sources are what keep a section from being decorative.
      expect(item.backedBy.length, item.href).toBeGreaterThan(0);
    }
  });

  it('has no empty groups', () => {
    for (const group of ADMIN_NAV) expect(group.items.length, group.id).toBeGreaterThan(0);
  });

  it('points every nav entry at a page that exists', () => {
    const routes = new Set(discoverAdminRoutes());
    for (const item of ADMIN_NAV_ITEMS) {
      expect(routes.has(item.href), `${item.href} has no page.tsx`).toBe(true);
    }
  });

  it('leaves no admin page unreachable from the nav', () => {
    const navigable = new Set(ADMIN_NAV_ITEMS.map((item) => item.href));
    for (const route of discoverAdminRoutes()) {
      expect(navigable.has(route), `${route} is not in the nav`).toBe(true);
    }
  });
});

describe('resolveAdminNavItem', () => {
  it('resolves a section by its own route', () => {
    expect(resolveAdminNavItem('/admin')?.label).toBe('Overview');
    expect(resolveAdminNavItem('/admin/bookings')?.label).toBe('Bookings');
  });

  it('prefers the deepest match over the /admin prefix every route shares', () => {
    // Overview lives at `/admin`, so a naive prefix match would win here.
    expect(resolveAdminNavItem('/admin/system/calendar')?.href).toBe('/admin/system/calendar');
    expect(resolveAdminNavItem('/admin/refunds')?.href).toBe('/admin/refunds');
  });

  it('keeps a detail route highlighted under its parent section', () => {
    expect(resolveAdminNavItem('/admin/bookings/bk_20260902_ABCD1234')?.href).toBe('/admin/bookings');
  });

  it('does not claim routes that merely start with the same characters', () => {
    expect(resolveAdminNavItem('/administrator')).toBeNull();
    expect(resolveAdminNavItem('/adminx/bookings')).toBeNull();
  });

  it('returns null for an unknown admin route rather than guessing', () => {
    expect(resolveAdminNavItem('/admin-not-a-route')).toBeNull();
    expect(resolveAdminNavItem('')).toBeNull();
  });
});
