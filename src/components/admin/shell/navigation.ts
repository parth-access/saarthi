/**
 * The admin console's information architecture, as data.
 *
 * One declaration drives the sidebar, the mobile drawer, the page heading and
 * the breadcrumb, so a route cannot appear in one and be missing from another.
 *
 * `status` is deliberately part of the model. This console is being built in
 * increments against a real backend, and a section that has no server-side
 * query behind it yet must say so rather than render a plausible-looking empty
 * table — an operator who cannot tell "nothing happened today" from "this page
 * was never wired up" will make the wrong call. `backedBy` names the real data
 * source each section reads, and is shown on the placeholder so the gap is
 * explicit. Flipping a section to 'ready' is what makes it navigable content.
 */
import {
  Activity,
  CalendarClock,
  CreditCard,
  Gauge,
  HeartPulse,
  History,
  LayoutDashboard,
  Radio,
  ReceiptText,
  Stethoscope,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminSectionStatus = 'ready' | 'planned';

export interface AdminNavItem {
  /** Route path; also the key used for active-state matching. */
  readonly href: string;
  readonly label: string;
  /** One line of what an operator does here — shown under the page title. */
  readonly purpose: string;
  readonly icon: LucideIcon;
  readonly status: AdminSectionStatus;
  /** Real collections / endpoints this section reads. Never aspirational UI. */
  readonly backedBy: readonly string[];
}

export interface AdminNavGroup {
  readonly id: 'operations' | 'system' | 'transitional';
  readonly label: string;
  /** Shown as the group's subtitle in wide sidebars. */
  readonly hint: string;
  readonly items: readonly AdminNavItem[];
}

/**
 * Primary operations come first because they are what the day is spent in;
 * system/technical sections are grouped apart so a routine booking lookup never
 * requires scanning past outbox internals.
 */
export const ADMIN_NAV: readonly AdminNavGroup[] = [
  {
    id: 'operations',
    label: 'Operations',
    hint: 'Running the practice',
    items: [
      {
        href: '/admin',
        label: 'Overview',
        purpose: 'What needs attention right now, and what is happening today.',
        icon: LayoutDashboard,
        status: 'ready',
        // Not `daily_metrics`: its day is keyed by the UTC date, so "today" would
        // begin at 5:30 AM IST, and its `bookingsCreated` counts slot holds that
        // are mostly abandoned. Every figure on the overview is read from the
        // documents themselves instead.
        backedBy: ['GET /api/admin/overview', 'bookings', 'refunds', 'outbox_events', 'emails'],
      },
      {
        href: '/admin/bookings',
        label: 'Bookings',
        purpose: 'Find any session and operate on it. The source of truth.',
        icon: CalendarClock,
        status: 'ready',
        backedBy: ['GET /api/admin/bookings', 'bookings'],
      },
      {
        href: '/admin/clients',
        label: 'Clients',
        purpose: 'Who has booked, and their history with the practice.',
        icon: Users,
        status: 'planned',
        backedBy: ['bookings (derived)'],
      },
      {
        href: '/admin/therapists',
        label: 'Therapists',
        purpose: 'Roster, availability and active status.',
        icon: Stethoscope,
        status: 'planned',
        backedBy: ['therapists', 'therapistAvailability', 'overrides'],
      },
      {
        href: '/admin/payments',
        label: 'Payments',
        purpose: 'Trace a payment from order to receipt.',
        icon: CreditCard,
        status: 'planned',
        backedBy: ['bookings (payment fields)', 'payments', '/api/receipts'],
      },
      {
        href: '/admin/refunds',
        label: 'Refunds',
        purpose: 'Refunds owed, in flight, processed and failed.',
        icon: ReceiptText,
        status: 'planned',
        backedBy: ['refunds', 'RefundPolicy'],
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Keeping the machinery honest',
    items: [
      {
        href: '/admin/system/calendar',
        label: 'Calendar & Meet',
        purpose: 'Sessions missing a Meet link, and retrying them.',
        icon: HeartPulse,
        status: 'planned',
        backedBy: ['bookings (calendarStatus)', 'POST /api/admin/calendar/retry'],
      },
      {
        href: '/admin/system/jobs',
        label: 'Background jobs',
        purpose: 'Outbox events, email queue, and replaying what failed.',
        icon: Radio,
        status: 'planned',
        backedBy: ['outbox_events', 'emails', 'POST /api/operations/replay'],
      },
      {
        href: '/admin/system/health',
        label: 'System health',
        purpose: 'Scheduled jobs, integrations and configuration checks.',
        icon: Gauge,
        status: 'planned',
        backedBy: ['/api/operations/dashboard', 'daily_metrics'],
      },
      {
        href: '/admin/system/activity',
        label: 'Activity log',
        purpose: 'Who did what, and what the system did in response.',
        icon: Activity,
        status: 'planned',
        backedBy: ['audit_logs', 'timelines'],
      },
    ],
  },
  {
    id: 'transitional',
    label: 'Transitional',
    hint: 'Being replaced',
    items: [
      {
        href: '/admin/legacy',
        label: 'Current console',
        purpose: 'The existing admin screens, until the sections above replace them.',
        icon: History,
        status: 'ready',
        backedBy: ['GET /api/bookings', 'therapists', 'contacts', 'emails'],
      },
    ],
  },
];

/** Every item, flattened, in navigation order. */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = ADMIN_NAV.flatMap((group) => group.items);

/**
 * The nav item a pathname belongs to.
 *
 * Longest matching href wins, so `/admin/system/calendar` resolves to Calendar
 * rather than to Overview (`/admin`, a prefix of every admin route). A nested
 * route such as `/admin/bookings/bk_1` resolves to its parent section, which is
 * what the sidebar should highlight while a detail page is open.
 */
export function resolveAdminNavItem(pathname: string): AdminNavItem | null {
  const candidates = ADMIN_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((longest, item) => (item.href.length > longest.href.length ? item : longest));
}
