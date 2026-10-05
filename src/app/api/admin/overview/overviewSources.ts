import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { firestoreRefundRepository } from '@/domains/payment/FirestoreRefundRepository';
import {
  isoOrNull,
  planAdminBookingList,
  toAdminBookingRow,
  type AdminBookingListRequest,
  type AdminBookingRow,
  type BookingStatusGroupId,
} from '@/domains/booking/queries/adminBookingQuery';
import {
  classifyHold,
  describeHold,
  type BoundedCount,
  type WaitingEvent,
} from '@/domains/admin/overviewTriage';
import { getIstNow } from '@/shared/scheduling/slots';
import { logger } from '../../_lib/logger';

/**
 * Reading the overview's numbers out of Firestore.
 *
 * Four rules hold for every source below, and they are the reason this is a
 * module rather than one long handler:
 *
 *  1. **Each source fails alone.** One unreachable collection must not blank the
 *     page or, worse, render as a set of zeroes. Every reader returns a
 *     {@link BoundedCount}, and its failure branch produces `ok: false` with a
 *     fixed sentence — never the caught error, which for a missing Firestore
 *     composite index carries the project id and a console URL. The real error
 *     goes to the server log.
 *
 *  2. **Every scan is bounded and every bound is admitted.** There are no
 *     aggregation queries here and nothing downloads a collection to take its
 *     length — which is what `/api/operations/dashboard` does today for queued
 *     and failed emails. Each reader fetches at most `limit + 1` documents and
 *     reports `atLeast` when it saw more than it will claim.
 *
 *  3. **Nothing is re-derived.** Where a cron already defines a set — the
 *     bookings needing a calendar retry, the refunds needing processing — the
 *     overview counts *that* set by calling the same repository method, so the
 *     figure an operator reads is the figure the job will act on. Where the
 *     bookings list already has an indexed query plan, the overview reuses it
 *     rather than writing a second query that could drift from the index file.
 *
 *  4. **Time is IST.** "Today" is the operator's day, resolved with
 *     `getIstNow()`, not `new Date().toISOString()` — which is how
 *     `daily_metrics` ends up keyed to a day that starts at 5:30 AM local.
 */

/** How many documents any one overview scan may read. */
export const OVERVIEW_SCAN_LIMIT = 60;

/** The day's own scan is larger: a whole IST day is still a bounded set. */
export const TODAY_SCAN_LIMIT = 100;

/**
 * The one sentence a failed source is allowed to say.
 *
 * Deliberately identical for every source and free of detail. A Firestore
 * `FAILED_PRECONDITION` names the project and links a console page that creates
 * the missing index; a permission error names the service account. None of that
 * belongs in a browser, and an operator cannot act on it anyway — what they can
 * act on is knowing the number is missing rather than zero.
 */
const UNREADABLE = 'Could not be read just now. Reload to try again.';

function failed(source: string, error: unknown): { ok: false; reason: string } {
  logger.error('SYSTEM', `Admin overview source "${source}" failed`, error, { source });
  return { ok: false, reason: UNREADABLE };
}

/* ------------------------------------------------------------------ *
 * Bookings-backed counts
 * ------------------------------------------------------------------ */

/**
 * Counts one indexed slice of the bookings list.
 *
 * Goes through `planAdminBookingList` so the query shape is one the project has
 * a declared composite index for — the same guarantee the bookings table gets —
 * and so a status group added there is counted here without a second edit.
 * `hasMore` from the paged read is exactly `atLeast`: the plan asks Firestore for
 * `pageSize + 1` documents for precisely this purpose.
 */
async function countBookingSlice(
  source: string,
  request: AdminBookingListRequest
): Promise<BoundedCount> {
  try {
    const planned = planAdminBookingList(request);
    // A refusal here is a bug in this file's own request, not an operator's
    // filter choice, so it is logged like any other failure rather than shown.
    if (!planned.ok) throw new Error(`${planned.code}: ${planned.message}`);

    const { bookings, hasMore } = await firestoreBookingRepository.findAdminPage(planned.plan);
    return { ok: true, count: bookings.length, atLeast: hasMore };
  } catch (error) {
    return failed(source, error);
  }
}

/** Bookings a client has requested and nobody has accepted or rejected yet. */
export function countAwaitingApproval(limit = OVERVIEW_SCAN_LIMIT): Promise<BoundedCount> {
  return countBookingSlice('awaiting_approval', {
    statusGroup: 'awaiting_approval',
    pageSize: limit,
  });
}

export interface LapsedHoldsResult {
  readonly count: BoundedCount;
  /** How long the oldest lapsed hold has been dead, phrased for an operator. */
  readonly oldest: string | null;
}

/**
 * Accepted bookings whose payment window has already passed.
 *
 * Lapsed-ness cannot be a Firestore predicate here: `holdExpiresAt` appears in no
 * declared composite index alongside `status`, and the two write paths do not even
 * agree on the window — `BOOKING_LIFETIME_MS` is 15 minutes while
 * `RescheduleBookingCommand` sets a fresh hold 10 minutes out. So the
 * awaiting-payment slice is read through the index it already has and each
 * document's own stored deadline decides. `atLeast` stays true whenever a further
 * page exists, because a later page could hold more lapsed ones.
 */
export async function countLapsedHolds(limit = OVERVIEW_SCAN_LIMIT): Promise<LapsedHoldsResult> {
  try {
    const planned = planAdminBookingList({ statusGroup: 'awaiting_payment', pageSize: limit });
    if (!planned.ok) throw new Error(`${planned.code}: ${planned.message}`);

    const { bookings, hasMore } = await firestoreBookingRepository.findAdminPage(planned.plan);
    const nowMs = Date.now();

    let lapsed = 0;
    let oldestExpiryMs: number | null = null;

    for (const booking of bookings) {
      const iso = isoOrNull((booking as { holdExpiresAt?: unknown }).holdExpiresAt);
      if (classifyHold(iso, nowMs).kind !== 'lapsed') continue;
      lapsed += 1;
      const expiryMs = iso === null ? NaN : Date.parse(iso);
      if (Number.isFinite(expiryMs) && (oldestExpiryMs === null || expiryMs < oldestExpiryMs)) {
        oldestExpiryMs = expiryMs;
      }
    }

    return {
      count: { ok: true, count: lapsed, atLeast: hasMore },
      oldest:
        oldestExpiryMs === null
          ? null
          : describeHold(classifyHold(new Date(oldestExpiryMs).toISOString(), nowMs)),
    };
  } catch (error) {
    return { count: failed('lapsed_holds', error), oldest: null };
  }
}

/**
 * Confirmed sessions with no Meet link — the set `/api/cron/retry-calendar` acts on.
 *
 * Counted through the repository's own scan rather than a fresh query, so this
 * number and the work that cron does can never describe different sets.
 */
export async function countMissingMeetLink(limit = OVERVIEW_SCAN_LIMIT): Promise<BoundedCount> {
  try {
    const { bookings, scanFilled } =
      await firestoreBookingRepository.scanBookingsNeedingCalendarRetry(limit);
    return { ok: true, count: bookings.length, atLeast: scanFilled };
  } catch (error) {
    return failed('missing_meet_link', error);
  }
}

/* ------------------------------------------------------------------ *
 * Refunds
 * ------------------------------------------------------------------ */

/**
 * Refunds still owed or retrying — the set `/api/cron/process-refunds` acts on.
 *
 * Asks for `limit + 1` so a full page can be reported as a floor rather than a
 * total.
 */
export async function countRefundsOutstanding(limit = OVERVIEW_SCAN_LIMIT): Promise<BoundedCount> {
  try {
    const refunds = await firestoreRefundRepository.findRefundsNeedingProcessing(limit + 1);
    return { ok: true, count: Math.min(refunds.length, limit), atLeast: refunds.length > limit };
  } catch (error) {
    return failed('refunds_outstanding', error);
  }
}

/* ------------------------------------------------------------------ *
 * Outbox and email log
 * ------------------------------------------------------------------ */

function requireDb() {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  return adminDb;
}

/**
 * A bounded equality scan that reports whether it saw more than it claims.
 *
 * Single-field `status ==`, which Firestore's automatic indexes serve — so this
 * adds no entry to `firestore.indexes.json` and needs no deploy.
 */
async function countByStatus(
  source: string,
  collection: string,
  status: string,
  limit: number
): Promise<BoundedCount> {
  try {
    const snapshot = await requireDb()
      .collection(collection)
      .where('status', '==', status)
      .limit(limit + 1)
      .get();
    return { ok: true, count: Math.min(snapshot.size, limit), atLeast: snapshot.size > limit };
  } catch (error) {
    return failed(source, error);
  }
}

/**
 * Outbox events that will never be retried.
 *
 * `dead` is the terminal status `OutboxProcessor` writes once `attempts` reaches
 * `maxAttempts`, and it is excluded from the processor's own scan. Nothing in the
 * platform will pick these up again, which is what makes them the one outbox
 * status that is unambiguously a person's problem.
 */
export function countAbandonedEvents(limit = OVERVIEW_SCAN_LIMIT): Promise<BoundedCount> {
  return countByStatus('events_abandoned', 'outbox_events', 'dead', limit);
}

/**
 * Emails left at `failed`.
 *
 * `sendEmailWithRetry` retries in-process and then writes `failed`; no job
 * re-drives that collection, so these are terminal too. The count is a count —
 * this reader never projects an email document, which stores the full rendered
 * `html` body alongside the recipient.
 */
export function countFailedEmails(limit = OVERVIEW_SCAN_LIMIT): Promise<BoundedCount> {
  return countByStatus('emails_failed', 'emails', 'failed', limit);
}

export interface MachinerySources {
  readonly waiting: BoundedCount;
  readonly dead: BoundedCount;
  readonly sample: readonly WaitingEvent[];
}

/**
 * The waiting side of the outbox, plus enough of each document to tell a healthy
 * retry from a stalled worker.
 *
 * `status in ['pending','processing']` is `OutboxProcessor.processPendingEvents`'
 * own selection, so "waiting" here means exactly what the job means by it. The
 * scan is unordered: ordering by `createdAt` alongside a `status` filter would
 * need a composite index this project does not declare, and adding one would make
 * the page depend on a deploy step. Bounded at `limit + 1` instead — under the
 * limit the answer is exact, and at the limit the backlog is already the story.
 *
 * Only three fields per event travel back, none of them the payload. An outbox
 * payload carries client names, emails and booking details; this is a summary
 * screen, and the place to read one event is the Background jobs section, for one
 * named event.
 */
export async function readMachinerySources(limit = OVERVIEW_SCAN_LIMIT): Promise<MachinerySources> {
  const dead = await countAbandonedEvents(limit);

  try {
    const snapshot = await requireDb()
      .collection('outbox_events')
      .where('status', 'in', ['pending', 'processing'])
      .limit(limit + 1)
      .get();

    const sample: WaitingEvent[] = snapshot.docs.slice(0, limit).map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        createdAtIso: isoOrNull(data.createdAt),
        nextAttemptAtIso: isoOrNull(data.nextAttemptAt),
        status: typeof data.status === 'string' ? data.status : 'unknown',
      };
    });

    return {
      waiting: { ok: true, count: Math.min(snapshot.size, limit), atLeast: snapshot.size > limit },
      dead,
      sample,
    };
  } catch (error) {
    return { waiting: failed('outbox_waiting', error), dead, sample: [] };
  }
}

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */

export type TodaySource =
  | {
      readonly ok: true;
      /** Sessions someone expects to attend: confirmed, rescheduled or completed. */
      readonly sessions: readonly AdminBookingRow[];
      /** Bookings on the same date that are not live sessions. */
      readonly other: readonly AdminBookingRow[];
      /** The day's scan filled, so both lists may be incomplete. */
      readonly atLeast: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/** Status groups that represent a session someone expects to attend. */
const LIVE_SESSION_GROUPS = new Set<BookingStatusGroupId>(['confirmed', 'completed']);

/**
 * Every booking on one IST date, split into the day's sessions and the rest.
 *
 * One indexed `date ==` query, ordered by `createdAt` because that is the index
 * the project declares; the *time* ordering an operator reads the day in is
 * applied by `orderTodaySchedule` in the browser, where the current clock is.
 *
 * The split happens here rather than in the query because filtering `date` plus
 * several status groups would mean one query per group. The day is a bounded set,
 * and a cancellation on today's date is something an operator wants to see rather
 * than have filtered away — it is just not a session.
 */
export async function readToday(date: string, limit = TODAY_SCAN_LIMIT): Promise<TodaySource> {
  try {
    const planned = planAdminBookingList({ date, pageSize: limit });
    if (!planned.ok) throw new Error(`${planned.code}: ${planned.message}`);

    const { bookings, hasMore } = await firestoreBookingRepository.findAdminPage(planned.plan);
    const rows = bookings.map(toAdminBookingRow);
    const isSession = (row: AdminBookingRow) =>
      row.statusGroup !== null && LIVE_SESSION_GROUPS.has(row.statusGroup);

    return {
      ok: true,
      sessions: rows.filter(isSession),
      other: rows.filter((row) => !isSession(row)),
      atLeast: hasMore,
    };
  } catch (error) {
    return failed('today', error);
  }
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export interface AdminOverviewPayload {
  readonly generatedAtIso: string;
  /** The operator's day, IST. Sent so the browser cannot disagree about it. */
  readonly istDate: string;
  readonly attention: {
    readonly awaiting_approval: BoundedCount;
    readonly lapsed_holds: BoundedCount;
    readonly missing_meet_link: BoundedCount;
    readonly refunds_outstanding: BoundedCount;
    readonly events_abandoned: BoundedCount;
    readonly emails_failed: BoundedCount;
  };
  /** One extra observed fact per queue, where there is one worth a sentence. */
  readonly notes: { readonly lapsed_holds: string | null };
  readonly today: TodaySource;
  readonly machinery: MachinerySources;
  /** The per-scan document cap, so the UI can explain what "60+" means. */
  readonly scanLimit: number;
}

/**
 * Reads every source concurrently and returns whatever answered.
 *
 * `Promise.all` is safe here only because no reader rejects: each one catches its
 * own failure and returns it as data. That is the property that makes a partial
 * overview possible, and it is why the readers above do not simply let Firestore
 * errors propagate to the route's try/catch — one bad collection would take the
 * whole page with it, and an operator would see nothing rather than five of six
 * queues plus an honest gap.
 */
export async function readAdminOverview(now: Date = new Date()): Promise<AdminOverviewPayload> {
  const istDate = getIstNow(now).date;

  const [awaitingApproval, lapsedHolds, missingMeetLink, refunds, failedEmails, machinery, today] =
    await Promise.all([
      countAwaitingApproval(),
      countLapsedHolds(),
      countMissingMeetLink(),
      countRefundsOutstanding(),
      countFailedEmails(),
      readMachinerySources(),
      readToday(istDate),
    ]);

  return {
    generatedAtIso: now.toISOString(),
    istDate,
    attention: {
      awaiting_approval: awaitingApproval,
      lapsed_holds: lapsedHolds.count,
      missing_meet_link: missingMeetLink,
      refunds_outstanding: refunds,
      // Counted once, by the machinery reader, and reported in both places.
      events_abandoned: machinery.dead,
      emails_failed: failedEmails,
    },
    notes: { lapsed_holds: lapsedHolds.oldest },
    today,
    machinery,
    scanLimit: OVERVIEW_SCAN_LIMIT,
  };
}
