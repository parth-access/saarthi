import type { Booking } from '@/types';

export type SessionView = 'all' | 'requests' | 'upcoming' | 'history';

export function parseSessionView(value: string | null): SessionView {
  return value === 'requests' || value === 'upcoming' || value === 'history'
    ? value
    : 'all';
}

const startKey = (b: Booking) => `${b.date ?? ''} ${b.time ?? ''}`;

/**
 * The order a therapist reads a list of sessions in: everything from today on,
 * soonest first, then everything earlier, most recent first. Bookings arrive in
 * the order they were made, which says nothing about when they happen.
 */
export function orderSessions(bookings: readonly Booking[], today: string): Booking[] {
  const ahead = bookings.filter((b) => (b.date ?? '') >= today);
  const behind = bookings.filter((b) => (b.date ?? '') < today);
  ahead.sort((a, b) => startKey(a).localeCompare(startKey(b)));
  behind.sort((a, b) => startKey(b).localeCompare(startKey(a)));
  return [...ahead, ...behind];
}

/** Keep dashboard and list meanings aligned: upcoming is the dashboard's computed set. */
export function sessionsForView(
  bookings: readonly Booking[],
  view: SessionView,
  upcomingSessions: readonly Booking[]
): Booking[] {
  if (view === 'all') return [...bookings];
  if (view === 'requests') {
    return bookings.filter((booking) =>
      booking.status === 'pending' || booking.status === 'pending_approval'
    );
  }
  if (view === 'history') {
    return bookings.filter((booking) =>
      booking.status === 'completed' || booking.status === 'cancelled' || booking.status === 'no_show'
    );
  }
  const upcomingIds = new Set(upcomingSessions.map((booking) => booking.id));
  return bookings.filter((booking) => upcomingIds.has(booking.id));
}
