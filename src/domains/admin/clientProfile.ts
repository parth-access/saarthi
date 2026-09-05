/**
 * A client, derived from their bookings — because there is no `clients` collection.
 *
 * Saarthi never modelled a client as a first-class record. A person exists only
 * as the repeated contact fields on the bookings they made. So a "client" here is
 * an aggregate computed over booking documents, and this module is where that
 * aggregation lives and is tested — pure, client-safe, no Firestore.
 *
 * Three honesty constraints shaped every function below:
 *
 *  1. **Email is the only real identity.** It is normalized (`trim().toLowerCase()`)
 *     at write time; phone is not, and name is free text. So clients are keyed on
 *     email, and the same person using two emails is two clients here. That is
 *     stated on the screen, not smoothed over.
 *  2. **Status meaning is not re-decided here.** Bucketing reuses
 *     `bookingStatusGroupFor` / `paymentStatusGroupFor`, so a client's "completed"
 *     count and the Bookings list's "completed" filter cannot drift apart.
 *  3. **Money that cannot be totalled says so.** A captured payment with no stored
 *     amount makes the paid total a floor, reported with `unpricedPaidCount` so the
 *     screen can show "≥ ₹X" rather than a number it cannot stand behind. As on the
 *     booking detail, `amountRupees` is rupees and `refundAmountPaise` is paise.
 */
import {
  BOOKING_STATUS_GROUPS,
  bookingStatusGroupFor,
  paymentStatusGroupFor,
  type AdminTone,
  type BookingStatusGroupId,
} from '@/domains/booking/queries/adminBookingQuery';

/**
 * A booking narrowed to what a client aggregate reads. The server projects stored
 * documents onto this shape; every field is a primitive so the array crosses to
 * the browser and the derivation below runs there — the tested logic is what the
 * operator sees. `sessionStartIso` is the session's UTC instant (from
 * `utcDateTime`), the only field that can place a session before or after "now".
 */
export interface AdminClientBookingRow {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly phone: string | null;
  readonly userId: string | null;
  readonly therapistId: string | null;
  readonly therapistName: string | null;
  readonly sessionDate: string | null;
  readonly sessionTime: string | null;
  readonly sessionType: string | null;
  readonly sessionMode: string | null;
  readonly status: string | null;
  readonly paymentStatus: string | null;
  readonly amountRupees: number | null;
  readonly currency: string | null;
  readonly refundStatus: string | null;
  readonly refundAmountPaise: number | null;
  readonly createdAtIso: string | null;
  readonly sessionStartIso: string | null;
}

/** The identity key. Matches the normalization applied at booking-write time. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Epoch ms for an ISO string, or null when absent or unparseable. */
function msOrNull(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/* ------------------------------------------------------------------ *
 * A single client's full profile
 * ------------------------------------------------------------------ */

/**
 * The contact fields, reconciled across every booking.
 *
 * `name` and `phone` are the most recent non-empty values, since a client can
 * change them between bookings. `nameVaried` / `phoneVaried` flag when more than
 * one distinct value was seen — worth surfacing, because it is the signal that two
 * people might be sharing an email, or that a typo split one person's history.
 */
export interface ClientIdentity {
  readonly name: string | null;
  readonly phone: string | null;
  readonly nameVaried: boolean;
  readonly phoneVaried: boolean;
  /** Distinct account ids this email has booked under. Empty for guest-only. */
  readonly userIds: readonly string[];
}

/** One status group with the client's count in it. Order follows the canonical groups. */
export interface ClientGroupCount {
  readonly id: BookingStatusGroupId;
  readonly label: string;
  readonly tone: AdminTone;
  readonly count: number;
}

/**
 * The money view. `paidRupees` is the sum of stored amounts on captured payments;
 * `unpricedPaidCount` is how many captured payments carried no amount, which makes
 * `paidRupees` a floor rather than a total. Refunds are in paise, as stored.
 */
export interface ClientMoney {
  readonly paidCount: number;
  readonly paidRupees: number;
  readonly unpricedPaidCount: number;
  readonly refundedCount: number;
  readonly refundedPaise: number;
}

export interface ClientProfile {
  readonly email: string;
  readonly identity: ClientIdentity;
  readonly total: number;
  /** Only groups the client actually has bookings in, in canonical order. */
  readonly groups: readonly ClientGroupCount[];
  /**
   * Confirmed sessions in the future. `unplaceable` counts confirmed sessions with
   * no resolvable instant — present, but impossible to say whether they are ahead.
   */
  readonly upcoming: { readonly count: number; readonly unplaceable: number };
  readonly money: ClientMoney;
  /** Statuses on the client's bookings that belong to no known group. */
  readonly unclassifiedCount: number;
  readonly firstSeenIso: string | null;
  readonly lastSeenIso: string | null;
  /** Every booking for this client, session-newest first. */
  readonly bookings: readonly AdminClientBookingRow[];
}

const CAPTURED_PAYMENT_GROUPS: ReadonlySet<string> = new Set(['paid', 'refunded']);

function isCaptured(paymentStatus: string | null): boolean {
  const group = paymentStatusGroupFor(paymentStatus);
  return group !== null && CAPTURED_PAYMENT_GROUPS.has(group.id);
}

function hasRefund(row: AdminClientBookingRow): boolean {
  return row.refundStatus !== null || (row.refundAmountPaise !== null && row.refundAmountPaise > 0);
}

/**
 * The sort key for a client's booking history: the session instant when known,
 * else when the booking was created, so an upcoming session sorts to the top and
 * a hold with no session date falls to the bottom rather than jumping around.
 */
function historyKey(row: AdminClientBookingRow): number | null {
  return msOrNull(row.sessionStartIso) ?? msOrNull(row.createdAtIso);
}

/** Most recent non-empty value, scanning bookings newest-created first. */
function mostRecent(
  rows: readonly AdminClientBookingRow[],
  pick: (row: AdminClientBookingRow) => string | null
): string | null {
  for (const row of rows) {
    const value = pick(row);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Build a client's profile from their bookings.
 *
 * `nowMs` is injected, never read from the clock inside, so "upcoming" is
 * assertable and a server and browser render of the same page cannot disagree
 * about which sessions are still ahead. `rows` are assumed to be this client's
 * bookings; the derivation trusts nothing else and recomputes every figure.
 */
export function deriveClientProfile(
  email: string,
  rows: readonly AdminClientBookingRow[],
  nowMs: number
): ClientProfile {
  // Newest-created first, for identity resolution and the returned list's tie-break.
  const byCreatedDesc = [...rows].sort(
    (a, b) => (msOrNull(b.createdAtIso) ?? 0) - (msOrNull(a.createdAtIso) ?? 0)
  );

  const names = new Set(rows.map((r) => r.name).filter((v): v is string => v !== null));
  const phones = new Set(rows.map((r) => r.phone).filter((v): v is string => v !== null));
  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))].sort();

  const identity: ClientIdentity = {
    name: mostRecent(byCreatedDesc, (r) => r.name),
    phone: mostRecent(byCreatedDesc, (r) => r.phone),
    nameVaried: names.size > 1,
    phoneVaried: phones.size > 1,
    userIds,
  };

  const counts = new Map<BookingStatusGroupId, number>();
  let unclassifiedCount = 0;
  let upcomingCount = 0;
  let upcomingUnplaceable = 0;
  const money = { paidCount: 0, paidRupees: 0, unpricedPaidCount: 0, refundedCount: 0, refundedPaise: 0 };

  for (const row of rows) {
    const group = bookingStatusGroupFor(row.status);
    if (group === null) {
      unclassifiedCount += 1;
    } else {
      counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
      if (group.id === 'confirmed') {
        const startMs = msOrNull(row.sessionStartIso);
        if (startMs === null) upcomingUnplaceable += 1;
        else if (startMs > nowMs) upcomingCount += 1;
      }
    }

    if (isCaptured(row.paymentStatus)) {
      money.paidCount += 1;
      if (row.amountRupees === null) money.unpricedPaidCount += 1;
      else money.paidRupees += row.amountRupees;
    }
    if (hasRefund(row)) {
      money.refundedCount += 1;
      if (row.refundAmountPaise !== null) money.refundedPaise += row.refundAmountPaise;
    }
  }

  const groups: ClientGroupCount[] = BOOKING_STATUS_GROUPS.filter(
    (group) => (counts.get(group.id) ?? 0) > 0
  ).map((group) => ({
    id: group.id,
    label: group.label,
    tone: group.tone,
    count: counts.get(group.id) ?? 0,
  }));

  const seenMs = rows.map((r) => msOrNull(r.createdAtIso)).filter((v): v is number => v !== null);
  const firstSeenIso = seenMs.length ? new Date(Math.min(...seenMs)).toISOString() : null;
  const lastSeenIso = seenMs.length ? new Date(Math.max(...seenMs)).toISOString() : null;

  const bookings = [...rows].sort((a, b) => {
    const ka = historyKey(a);
    const kb = historyKey(b);
    if (ka === null && kb === null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka !== kb) return kb - ka;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    email,
    identity,
    total: rows.length,
    groups,
    upcoming: { count: upcomingCount, unplaceable: upcomingUnplaceable },
    money,
    unclassifiedCount,
    firstSeenIso,
    lastSeenIso,
    bookings,
  };
}

/* ------------------------------------------------------------------ *
 * Recently-active clients
 * ------------------------------------------------------------------ */

/**
 * A client as they appear in the recent-activity list: enough to recognise the
 * person and reach their full profile, and deliberately no lifetime figures. The
 * list is built from a bounded scan of recent bookings, so any count taken from it
 * would be a count "in the last N bookings" masquerading as a total — the profile,
 * which reads all of a client's bookings, is where real totals live.
 */
export interface RecentClient {
  readonly email: string;
  readonly name: string | null;
  readonly lastActiveIso: string | null;
  readonly lastBooking: {
    readonly id: string;
    readonly sessionDate: string | null;
    readonly sessionTime: string | null;
    readonly therapistName: string | null;
    readonly status: string | null;
    readonly paymentStatus: string | null;
  };
}

/**
 * Collapse recent bookings into distinct clients, keyed by normalized email.
 *
 * A booking with no email cannot be attributed to a client and is left out — the
 * Bookings list, not this one, is the booking-centric source of truth. Each client
 * is represented by their most recently *created* booking, and ordered by that
 * time, so the list reads as "who did something most recently".
 */
export function groupRecentClients(rows: readonly AdminClientBookingRow[]): readonly RecentClient[] {
  const latestByEmail = new Map<string, AdminClientBookingRow>();
  const rowsByEmail = new Map<string, AdminClientBookingRow[]>();

  for (const row of rows) {
    if (row.email === null) continue;
    const key = normalizeEmail(row.email);
    if (key.length === 0) continue;

    const bucket = rowsByEmail.get(key);
    if (bucket) bucket.push(row);
    else rowsByEmail.set(key, [row]);

    const current = latestByEmail.get(key);
    const rowMs = msOrNull(row.createdAtIso) ?? -Infinity;
    const currentMs = current ? msOrNull(current.createdAtIso) ?? -Infinity : -Infinity;
    if (!current || rowMs > currentMs) latestByEmail.set(key, row);
  }

  const clients: RecentClient[] = [];
  for (const [email, latest] of latestByEmail) {
    const bucket = rowsByEmail.get(email) ?? [];
    const byCreatedDesc = [...bucket].sort(
      (a, b) => (msOrNull(b.createdAtIso) ?? 0) - (msOrNull(a.createdAtIso) ?? 0)
    );
    clients.push({
      email,
      name: mostRecent(byCreatedDesc, (r) => r.name),
      lastActiveIso: latest.createdAtIso,
      lastBooking: {
        id: latest.id,
        sessionDate: latest.sessionDate,
        sessionTime: latest.sessionTime,
        therapistName: latest.therapistName,
        status: latest.status,
        paymentStatus: latest.paymentStatus,
      },
    });
  }

  return clients.sort((a, b) => {
    const ma = msOrNull(a.lastActiveIso);
    const mb = msOrNull(b.lastActiveIso);
    if (ma === null && mb === null) return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
    if (ma === null) return 1;
    if (mb === null) return -1;
    if (ma !== mb) return mb - ma;
    return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
  });
}



