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
  Inbox,
  LayoutDashboard,
  Mail,
  Radar,
  Radio,
  ReceiptText,
  Stethoscope,
  UserCog,
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
  readonly id: 'operations' | 'system' | 'administration' | 'transitional';
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
        status: 'ready',
        backedBy: ['GET /api/admin/clients', 'bookings (grouped by email)'],
      },
      {
        href: '/admin/therapists',
        label: 'Therapists',
        purpose: 'Who is bookable, and the working hours that decide their start times.',
        icon: Stethoscope,
        status: 'ready',
        backedBy: [
          'GET /api/admin/therapists',
          'therapists',
          'therapistAvailability/{id}/recurringRules',
          'therapistAvailability/{id}/overrides',
        ],
      },
      {
        href: '/admin/payments',
        label: 'Payments',
        purpose: 'Trace a payment from order to receipt.',
        icon: CreditCard,
        status: 'ready',
        backedBy: ['GET /api/admin/payments', 'payments', 'bookings', '/api/receipts (number)'],
      },
      {
        href: '/admin/refunds',
        label: 'Refunds',
        purpose: 'Refunds owed, in flight, processed and failed.',
        icon: ReceiptText,
        status: 'ready',
        backedBy: ['GET /api/admin/refunds', 'refunds', 'bookings'],
      },
      {
        href: '/admin/contacts',
        label: 'Contacts',
        purpose: 'Inquiries from the website form, triaged and answered from your mail client.',
        icon: Inbox,
        status: 'ready',
        backedBy: ['GET /api/admin/contacts', 'PATCH/DELETE /api/admin/contacts/[id]', 'contacts'],
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
        status: 'ready',
        backedBy: ['GET /api/admin/calendar', 'POST /api/admin/calendar/retry', 'bookings (calendarStatus)'],
      },
      {
        href: '/admin/system/jobs',
        label: 'Background jobs',
        purpose: 'Outbox events, email queue, and replaying what failed.',
        icon: Radio,
        status: 'ready',
        backedBy: ['GET /api/admin/jobs', 'POST /api/operations/replay', 'outbox_events', 'emails'],
      },
      {
        href: '/admin/system/email',
        label: 'Email operations',
        purpose: 'The dispatch log: what went out, what failed, and resending one.',
        icon: Mail,
        status: 'ready',
        backedBy: ['GET /api/admin/emails', 'POST /api/email/resend', 'emails'],
      },
      {
        href: '/admin/system/operations',
        label: 'Operations',
        purpose: 'Queue health, correlation search, the recent timeline, and re-drives.',
        icon: Radar,
        status: 'ready',
        backedBy: ['GET /api/operations/dashboard', 'GET /api/operations/search', 'POST /api/operations/replay', 'timelines', 'daily_metrics'],
      },
      {
        href: '/admin/system/activity',
        label: 'Activity log',
        purpose: 'Who did what, and what the system did in response.',
        icon: Activity,
        status: 'ready',
        backedBy: ['GET /api/admin/activity', 'timelines'],
      },
      {
        href: '/admin/system/health',
        label: 'System health',
        purpose: 'Queue levels, configuration checks and the machinery counters.',
        icon: Gauge,
        status: 'ready',
        backedBy: ['GET /api/admin/overview', 'GET /api/operations/dashboard', 'daily_metrics'],
      },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    hint: 'Who holds the keys',
    items: [
      {
        href: '/admin/settings/users',
        label: 'Users & roles',
        purpose: 'Accounts, their roles, and access revocation — planned, not built.',
        icon: UserCog,
        // Deliberately 'planned'. Role mutation is the highest-risk surface in
        // the platform (self-escalation, session revocation interplay), it has
        // no legacy capability to reach parity with — role changes have only
        // ever happened by direct database edit — and building it in the same
        // pass as the migration would rush the one piece of the console whose
        // failure mode is granting authority. It stays visible here, as an
        // honest placeholder, until it is designed properly.
        status: 'planned',
        backedBy: ['users (role, sessionRevokeBefore)'],
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
