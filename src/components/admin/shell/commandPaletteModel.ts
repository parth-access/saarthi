/**
 * What the command palette offers for a typed query, as data.
 *
 * Kept apart from the component so the matching rules are tested without a DOM.
 * Every entry is a navigation: the palette never performs an operation itself,
 * it takes the operator to the screen that does, where the confirmation and
 * the server-side checks live.
 */
import { ADMIN_NAV_ITEMS } from './navigation';

export type PaletteGroupId = 'search' | 'views' | 'actions' | 'sections';

export interface PaletteEntry {
  readonly id: string;
  readonly group: PaletteGroupId;
  readonly label: string;
  /** One line under the label: what choosing it will do. */
  readonly hint: string;
  readonly href: string;
  /** Extra words that should match, beyond the label. */
  readonly keywords?: string;
}

export const PALETTE_GROUP_LABELS: Record<PaletteGroupId, string> = {
  search: 'Search',
  views: 'Quick views',
  actions: 'Do something',
  sections: 'Go to',
};

/** Today's date in India, as the bookings filter's `YYYY-MM-DD`. */
export function istDateString(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Which field a bookings lookup will match, in the operator's words. Mirrors
 * the server's `classifyTerm` in `adminBookingQuery` closely enough to label
 * the result; the server still decides.
 */
export function describeLookup(term: string): string {
  if (/^bk_/i.test(term)) return 'Open this booking ID';
  if (/^order_/i.test(term)) return 'Find the booking for this Razorpay order';
  if (/^pay_/i.test(term)) return 'Find the booking for this Razorpay payment';
  if (term.includes('@')) return 'Find bookings by this email';
  if (/^\+?[\d\s()-]{6,}$/.test(term)) return 'Find bookings by this phone number';
  return 'Find bookings by client name (starts with)';
}

function staticEntries(today: string): PaletteEntry[] {
  const views: PaletteEntry[] = [
    { id: 'view-today', group: 'views', label: "Today's sessions", hint: 'Bookings scheduled for today', href: `/admin/bookings?date=${today}`, keywords: 'schedule day' },
    { id: 'view-approval', group: 'views', label: 'Awaiting your approval', hint: 'Requests to confirm or decline', href: '/admin/bookings?status=awaiting_approval', keywords: 'pending confirm approve' },
    { id: 'view-confirmed', group: 'views', label: 'Confirmed sessions', hint: 'Upcoming and paid', href: '/admin/bookings?status=confirmed', keywords: 'upcoming' },
    { id: 'view-failed-payments', group: 'views', label: 'Failed payments', hint: 'Bookings whose payment failed', href: '/admin/bookings?payment=failed', keywords: 'razorpay' },
    { id: 'view-refunds', group: 'views', label: 'Refunds owed', hint: 'Refunds in flight or failed', href: '/admin/refunds', keywords: 'money back' },
  ];
  const actions: PaletteEntry[] = [
    { id: 'act-therapist', group: 'actions', label: 'Add a therapist', hint: 'Create a profile on the Therapists page', href: '/admin/therapists', keywords: 'new create doctor counsellor' },
    { id: 'act-jobs', group: 'actions', label: 'Run background jobs now', hint: 'Reminders, outbox, refunds, Meet links', href: '/admin/system/jobs', keywords: 'cron trigger process retry' },
    { id: 'act-meet', group: 'actions', label: 'Fix missing Meet links', hint: 'Retry calendar events', href: '/admin/system/calendar', keywords: 'google calendar meet link' },
    { id: 'act-email', group: 'actions', label: 'Resend an email', hint: 'From the dispatch log', href: '/admin/system/email', keywords: 'mail confirmation receipt' },
    { id: 'act-role', group: 'actions', label: "Change a user's role or access", hint: 'Promote, disable, sign out everywhere', href: '/admin/settings/users', keywords: 'admin therapist ban revoke permission' },
    { id: 'act-export', group: 'actions', label: 'Export data as CSV', hint: 'Bookings, payments and clients', href: '/admin/bookings', keywords: 'download spreadsheet excel' },
    { id: 'act-contacts', group: 'actions', label: 'Answer website inquiries', hint: 'Contact form messages', href: '/admin/contacts', keywords: 'contact form message' },
  ];
  const sections: PaletteEntry[] = ADMIN_NAV_ITEMS.map((item) => ({
    id: `section-${item.href}`,
    group: 'sections',
    label: item.label,
    hint: item.purpose,
    href: item.href,
  }));
  return [...views, ...actions, ...sections];
}

function matches(entry: PaletteEntry, query: string): boolean {
  const haystack = `${entry.label} ${entry.keywords ?? ''} ${entry.group === 'sections' ? '' : entry.hint}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * The entries for a query, in display order.
 *
 * A non-empty query always offers a bookings lookup, the one result that never
 * fails to match. It comes first for an id, email or phone — what an operator
 * pasting one came for — and after the matching pages for a plain word.
 */
export function paletteResults(rawQuery: string, now: Date = new Date()): PaletteEntry[] {
  const query = rawQuery.trim();
  const entries = staticEntries(istDateString(now));
  if (query.length === 0) return entries;

  const lookup: PaletteEntry = {
    id: 'search-bookings',
    group: 'search',
    label: `Search bookings for “${query}”`,
    hint: describeLookup(query),
    // A full booking id goes straight to the booking rather than to a list of one.
    href: /^bk_[A-Za-z0-9_-]+$/.test(query)
      ? `/admin/bookings/${encodeURIComponent(query)}`
      : `/admin/bookings?q=${encodeURIComponent(query)}`,
  };
  const matched = entries.filter((entry) => matches(entry, query));
  // An id, email or phone is a lookup and nothing else; a plain word is more
  // often a page name, so pages that match it come before the name search.
  const looksLikeIdentifier = /^(bk_|order_|pay_)/i.test(query) || query.includes('@') || /\d{4,}/.test(query);
  return looksLikeIdentifier || matched.length === 0 ? [lookup, ...matched] : [...matched, lookup];
}
