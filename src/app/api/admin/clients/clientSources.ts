import { adminDb } from '@/lib/firebase/admin';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { normalizeEmail, type AdminClientBookingRow } from '@/domains/admin/clientProfile';
import { logger } from '../../_lib/logger';

/**
 * Reading the bookings behind a client, out of Firestore.
 *
 * There is no `clients` collection, so a client is assembled from booking
 * documents and every read here targets `bookings`. Two constraints, the same two
 * that shape the payments source:
 *
 *  1. **Email is the identity, and it is indexed for free.** A profile is one
 *     single-field equality query (`email == …`), served by the automatic
 *     single-field index. The recent list is a single-field `orderBy('createdAt')`,
 *     also automatic. Neither combines the two, which would need a composite index
 *     `firestore.indexes.json` does not declare for a non-`bookings` shape — and
 *     both of these are on `bookings`, which is the one collection that is indexed.
 *  2. **The aggregation is not done here.** This projects documents to client-safe
 *     rows and hands the array to the browser, where `deriveClientProfile` and
 *     `groupRecentClients` compute every figure — so the tested logic is what an
 *     operator sees, exactly as the payments trace reconciles client-side.
 *
 * A profile is the "named one" case — an operator has searched a specific email —
 * so its rows carry name and phone. The recent list is also client-centric by
 * nature and carries name and email; it is the one bulk list on the console that
 * does, because a list of people that hid who they were would be useless.
 */

/** How many recent bookings the activity list may scan. */
export const CLIENT_SCAN_LIMIT = 60;

/** How many of one client's bookings a profile will read. */
export const CLIENT_PROFILE_LIMIT = 200;

/** The one sentence a failed read is allowed to say — matches the other sections. */
const UNREADABLE = 'Could not be read just now. Reload to try again.';

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A `bookings` document narrowed to what a client aggregate reads. */
function toClientRow(id: string, data: Record<string, unknown>): AdminClientBookingRow {
  return {
    id,
    email: trimmedOrNull(data.email),
    name: trimmedOrNull(data.name),
    phone: trimmedOrNull(data.phone),
    userId: trimmedOrNull(data.userId),
    therapistId: trimmedOrNull(data.therapistId),
    therapistName: trimmedOrNull(data.therapistName),
    sessionDate: trimmedOrNull(data.date),
    sessionTime: trimmedOrNull(data.time),
    sessionType: trimmedOrNull(data.sessionType),
    sessionMode: trimmedOrNull(data.sessionMode),
    status: trimmedOrNull(data.status),
    paymentStatus: trimmedOrNull(data.paymentStatus),
    amountRupees: finiteOrNull(data.paymentAmount),
    currency: trimmedOrNull(data.paymentCurrency),
    refundStatus: trimmedOrNull(data.refundStatus),
    refundAmountPaise: finiteOrNull(data.refundAmount),
    createdAtIso: isoOrNull(data.createdAt),
    sessionStartIso: isoOrNull(data.utcDateTime),
  };
}

function failed(source: string, error: unknown): { ok: false; reason: string } {
  // The raw Firestore error stays in the server log; the browser gets fixed copy.
  logger.error('BOOKING', `Admin clients source "${source}" failed`, error, { source });
  return { ok: false, reason: UNREADABLE };
}

/* ------------------------------------------------------------------ *
 * One client's bookings
 * ------------------------------------------------------------------ */

/**
 * Every booking for one email. `reason` is data, not an exception, so a broken
 * profile read never takes the recent list down with it. `atLeast` is true when a
 * client has more bookings than the profile reads — rare, but it means the totals
 * are a lower bound and the screen must say so rather than imply completeness.
 */
export type AdminClientProfileResult =
  | {
      readonly ok: true;
      readonly query: string;
      readonly email: string;
      readonly rows: readonly AdminClientBookingRow[];
      readonly atLeast: boolean;
    }
  | { readonly ok: false; readonly query: string; readonly reason: string };

export async function readClientProfile(query: string): Promise<AdminClientProfileResult> {
  const q = query.trim();
  const email = normalizeEmail(q);
  if (!adminDb) return { ok: false, query: q, reason: UNREADABLE };
  try {
    const snapshot = await adminDb
      .collection('bookings')
      .where('email', '==', email)
      .limit(CLIENT_PROFILE_LIMIT + 1)
      .get();

    const atLeast = snapshot.docs.length > CLIENT_PROFILE_LIMIT;
    const rows = snapshot.docs
      .slice(0, CLIENT_PROFILE_LIMIT)
      .map((doc) => toClientRow(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
    return { ok: true, query: q, email, rows, atLeast };
  } catch (error) {
    logger.error('BOOKING', 'Admin client profile failed to read', error);
    return { ok: false, query: q, reason: UNREADABLE };
  }
}

/* ------------------------------------------------------------------ *
 * Recently-active clients
 * ------------------------------------------------------------------ */

export type RecentClientsScan =
  | { readonly ok: true; readonly rows: readonly AdminClientBookingRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * The most recent bookings, newest first, for the browser to collapse into
 * distinct clients. A single-field `orderBy('createdAt','desc')`, served by the
 * automatic index. Reads `limit + 1` so the bound can be admitted: this is the
 * tail of recent activity, explicitly not every client the practice has ever had.
 */
export async function readRecentClientBookings(limit = CLIENT_SCAN_LIMIT): Promise<RecentClientsScan> {
  if (!adminDb) return failed('clients_recent', new Error('Firestore adminDb is not initialized.'));
  try {
    const snapshot = await adminDb
      .collection('bookings')
      .orderBy('createdAt', 'desc')
      .limit(limit + 1)
      .get();

    const atLeast = snapshot.docs.length > limit;
    const rows = snapshot.docs
      .slice(0, limit)
      .map((doc) => toClientRow(doc.id, (doc.data() ?? {}) as Record<string, unknown>));
    return { ok: true, rows, atLeast };
  } catch (error) {
    return failed('clients_recent', error);
  }
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export interface AdminClientsPayload {
  readonly generatedAtIso: string;
  /** `null` when the page opened without a search. */
  readonly profile: AdminClientProfileResult | null;
  readonly recent: RecentClientsScan;
  readonly scanLimit: number;
  readonly profileLimit: number;
}

/**
 * The profile (if an email was given) and the recent list, concurrently. Neither
 * reader rejects — each returns its failure as data — so one broken read still
 * lets the other through.
 */
export async function readAdminClients(
  query: string | null,
  now: Date = new Date()
): Promise<AdminClientsPayload> {
  const trimmed = query?.trim() ?? '';
  const [profile, recent] = await Promise.all([
    trimmed.length > 0
      ? readClientProfile(trimmed)
      : Promise.resolve<AdminClientProfileResult | null>(null),
    readRecentClientBookings(),
  ]);

  return {
    generatedAtIso: now.toISOString(),
    profile,
    recent,
    scanLimit: CLIENT_SCAN_LIMIT,
    profileLimit: CLIENT_PROFILE_LIMIT,
  };
}

