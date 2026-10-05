/**
 * The therapist workspace's information architecture, as data.
 *
 * Mirrors the admin console's `navigation.ts`: one declaration drives the
 * sidebar, the mobile drawer, the page heading and any breadcrumb, so a route
 * cannot appear in one and be missing from another.
 *
 * Only three sections: a therapist's day is sessions and availability, not
 * platform operations. Every href is backed by a working route.
 */
import {
  CalendarDays,
  Clock3,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

export interface TherapistNavItem {
  /** Route path; also the key used for active-state matching. */
  readonly href: string;
  readonly label: string;
  /** One line shown under the page title. */
  readonly purpose: string;
  readonly icon: LucideIcon;
}

export const THERAPIST_NAV: readonly TherapistNavItem[] = [
  {
    href: '/therapist',
    label: 'Dashboard',
    purpose: 'Your schedule, next session, and what needs attention.',
    icon: LayoutDashboard,
  },
  {
    href: '/therapist/sessions',
    label: 'Sessions',
    purpose: 'Search and manage all sessions assigned to you.',
    icon: CalendarDays,
  },
  {
    href: '/therapist/availability',
    label: 'Availability',
    purpose: 'The hours that determine when clients can book you.',
    icon: Clock3,
  },
];

/**
 * The nav item a pathname belongs to.
 *
 * Longest matching href wins, so `/therapist/sessions` resolves correctly
 * rather than always falling back to `/therapist`. A nested route such as
 * `/therapist/bookings/bk_1` resolves to Dashboard (its parent section).
 */
export function resolveTherapistNavItem(pathname: string): TherapistNavItem | null {
  const candidates = THERAPIST_NAV.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  if (candidates.length === 0) {
    // Fallback: /therapist/bookings/* should highlight Dashboard
    if (pathname.startsWith('/therapist')) return THERAPIST_NAV[0];
    return null;
  }
  return candidates.reduce((longest, item) =>
    item.href.length > longest.href.length ? item : longest
  );
}
