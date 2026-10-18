/**
 * Group a therapist's bookings into clients. Pure, so it is unit-tested.
 *
 * A client is keyed by account (`userId`) when present, else by lower-cased
 * email — the same identity rule the booking flow uses for guests.
 * Abandoned checkouts (never paid, expired holds) are not sessions and do not
 * create a client on their own.
 */
import type { Booking } from '@/types';

export interface ClientSummary {
  key: string;
  name: string;
  email: string;
  phone: string;
  age?: number;
  gender?: string;
  sessions: Booking[]; // newest first
  completed: number;
  upcoming: number;
  cancelled: number;
  noShow: number;
  lastSessionDate: string | null;
  nextSessionDate: string | null;
  followUpRecommended: boolean;
}

const ABANDONED = new Set(['expired', 'slot_locked', 'awaiting_payment', 'pending_payment']);
const UPCOMING = new Set(['confirmed', 'rescheduled']);

export function clientKey(b: Pick<Booking, 'userId' | 'email'>): string | null {
  if (b.userId) return `u:${b.userId}`;
  const email = (b.email || '').trim().toLowerCase();
  return email ? `e:${email}` : null;
}

export function groupClients(bookings: readonly Booking[], today: string): ClientSummary[] {
  const map = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (ABANDONED.has(b.status) && b.paymentStatus !== 'paid') continue;
    const key = clientKey(b);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }

  const clients: ClientSummary[] = [];
  for (const [key, list] of map) {
    const sessions = [...list].sort((a, b) =>
      `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)
    );
    const latest = sessions[0];
    const past = sessions.filter((s) => s.status === 'completed');
    const future = sessions.filter((s) => UPCOMING.has(s.status) && (s.date || '') >= today);
    clients.push({
      key,
      name: latest.name || 'Unnamed client',
      email: latest.email || '',
      phone: latest.phone || '',
      age: latest.age,
      gender: latest.gender,
      sessions,
      completed: past.length,
      upcoming: future.length,
      cancelled: sessions.filter((s) => s.status === 'cancelled' || s.status === 'rejected').length,
      noShow: sessions.filter((s) => s.status === 'no_show').length,
      lastSessionDate: past[0]?.date ?? null,
      nextSessionDate: future.length ? future[future.length - 1].date : null,
      followUpRecommended: past[0]?.followUpStatus === 'recommended',
    });
  }
  // Clients with something coming up first, then most recently seen.
  return clients.sort((a, b) => {
    if (a.nextSessionDate && !b.nextSessionDate) return -1;
    if (!a.nextSessionDate && b.nextSessionDate) return 1;
    if (a.nextSessionDate && b.nextSessionDate) return a.nextSessionDate.localeCompare(b.nextSessionDate);
    return (b.lastSessionDate ?? '').localeCompare(a.lastSessionDate ?? '');
  });
}
