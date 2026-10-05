/**
 * What the overview claims needs attention, and how sure it is.
 *
 * Pure and client-safe, because the route and the screen must not be able to
 * disagree about any of it. Three kinds of rule live here:
 *
 *  1. **The attention queues themselves** — which backlogs an operator is
 *     accountable for, in the order they should be read, with the sentence that
 *     says why each one matters. Ordering is data rather than JSX so the screen
 *     cannot quietly promote a cosmetic queue above one where a client is
 *     waiting.
 *
 *  2. **Counting honestly.** Every count on this page comes from a *bounded*
 *     Firestore scan — no aggregation queries, no downloading a collection to
 *     take its length. A scan that fills its limit reports `atLeast: true`, and
 *     the UI renders "60+" rather than pretending 60 is the total. A scan that
 *     *failed* reports `ok: false`, which is deliberately not the same value as
 *     zero: "nothing needs attention" and "we could not check" are the two
 *     answers an operator must never see conflated, and `allClear` below is only
 *     true when every source actually answered.
 *
 *  3. **Inference, labelled as inference.** Saarthi keeps no record of cron
 *     runs — `scheduled-jobs.yml` curls five endpoints every five minutes and
 *     nothing writes a heartbeat anywhere. So the health of the background
 *     worker can only be *deduced* from the state of the work it should have
 *     done, and {@link readMachinery} says which deduction it made and what it
 *     cannot rule out. There is no green dot on this page for a service nobody
 *     pinged.
 *
 * Deliberately absent: `daily_metrics`. Those documents are real, but they are
 * keyed by the **UTC** date (`MetricsListener` uses
 * `new Date().toISOString().split('T')[0]`), so "today" there begins at 5:30 AM
 * IST, and `bookingsCreated` increments on `BookingSlotLocked` — a slot hold,
 * most of which are abandoned without a booking ever being submitted. A tile
 * labelled "bookings today" fed from that field would be a wrong number with a
 * plausible name. Everything here is derived from the `bookings`, `refunds`,
 * `outbox_events` and `emails` documents themselves.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { SESSION_DURATION_MINUTES } from '@/shared/constants';
import { slotStartEpochMs } from '@/shared/scheduling/slots';

/* ------------------------------------------------------------------ *
 * Bounded counting
 * ------------------------------------------------------------------ */

/**
 * A number this page is willing to print, or an admission that it has none.
 *
 * `atLeast` is set when the underlying scan returned as many documents as it was
 * allowed to fetch, so the true figure is that or higher. Collapsing this into a
 * plain number is how a console reports "25 refunds pending" for a month while
 * the real backlog grows into the hundreds.
 */
export type BoundedCount =
  | { readonly ok: true; readonly count: number; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

/** The count for a scan that returned `count` documents out of a `limit`. */
export function boundedCount(count: number, limit: number): BoundedCount {
  return { ok: true, count, atLeast: count >= limit };
}

export function formatBoundedCount(value: BoundedCount): string {
  if (!value.ok) return '—';
  return value.atLeast ? `${value.count}+` : String(value.count);
}

/* ------------------------------------------------------------------ *
 * Attention queues
 * ------------------------------------------------------------------ */

export type AttentionQueueId =
  | 'awaiting_approval'
  | 'lapsed_holds'
  | 'missing_meet_link'
  | 'refunds_outstanding'
  | 'events_abandoned'
  | 'emails_failed';

export interface AttentionQueueDefinition {
  readonly id: AttentionQueueId;
  readonly label: string;
  /** Exactly what the number counts. Not a restatement of the label. */
  readonly meaning: string;
  /** Why it is on this list: what goes wrong for a real person if it is ignored. */
  readonly consequence: string;
  readonly tone: AdminTone;
  /**
   * Where an operator goes to act on it — or `null` while that section is still
   * a placeholder. A row must never link somewhere that cannot do the work; a
   * link that lands on "not wired up yet" is worse than no link, because it
   * costs a click to discover. `handledIn` names the destination either way.
   */
  readonly href: string | null;
  readonly handledIn: string;
}

/**
 * Ordered by who is left waiting, not by how alarming the number looks.
 *
 * The first two are cases where a *client* is stuck: one has asked for a session
 * and heard nothing, the other has a slot held with no way left to pay for it.
 * Then the two that break a session that has already been paid for. The last two
 * are machinery — real, but a stuck outbox event has usually already been
 * survived by whatever it was supposed to announce.
 */
export const ATTENTION_QUEUES: readonly AttentionQueueDefinition[] = [
  {
    id: 'awaiting_approval',
    label: 'Awaiting your approval',
    meaning: 'Bookings a client submitted that have not been accepted or declined.',
    consequence: 'The client is waiting and has had no answer. Nothing else in the flow starts until this does.',
    tone: 'warning',
    href: '/admin/bookings?status=awaiting_approval',
    handledIn: 'Bookings',
  },
  {
    id: 'lapsed_holds',
    label: 'Payment holds that lapsed',
    meaning: 'Accepted bookings whose payment window has passed with no payment recorded.',
    consequence: 'The client can no longer pay for the slot they picked, and may not know it. Confirm it manually or cancel to free the slot.',
    tone: 'warning',
    href: '/admin/bookings?payment=unpaid',
    handledIn: 'Bookings',
  },
  {
    id: 'missing_meet_link',
    label: 'Confirmed with no Meet link',
    meaning: 'Confirmed sessions whose Google Calendar event never got created — exactly the set the retry-calendar cron scans.',
    consequence: 'Nobody has a link to join. The client was told the session is confirmed.',
    tone: 'danger',
    // Retrying lives in the Calendar & Meet section, which has no query yet.
    href: '/admin/bookings?status=confirmed',
    handledIn: 'Calendar & Meet',
  },
  {
    id: 'refunds_outstanding',
    label: 'Refunds owed or retrying',
    meaning: 'Refund requests still PENDING or FAILED — exactly the set the process-refunds cron scans.',
    consequence: 'Money a cancellation promised has not reached the client.',
    tone: 'danger',
    href: null,
    handledIn: 'Refunds',
  },
  {
    id: 'events_abandoned',
    label: 'Background events given up on',
    meaning: 'Outbox events marked dead after exhausting their retries.',
    consequence: 'Whatever each one was going to do — an email, a calendar sync, a metric — will never happen on its own.',
    tone: 'danger',
    href: null,
    handledIn: 'Background jobs',
  },
  {
    id: 'emails_failed',
    label: 'Emails that failed to send',
    meaning: 'Documents in the email log left at status failed after their in-process retries.',
    consequence: 'A client or therapist was never told something the platform believes it told them.',
    tone: 'danger',
    href: null,
    handledIn: 'Background jobs',
  },
];

const QUEUE_BY_ID = new Map(ATTENTION_QUEUES.map((queue) => [queue.id, queue]));

export function attentionQueue(id: AttentionQueueId): AttentionQueueDefinition {
  const queue = QUEUE_BY_ID.get(id);
  if (!queue) throw new Error(`Unknown attention queue "${id}".`);
  return queue;
}

/** What the server reports for one queue. */
export type AttentionCounts = { readonly [K in AttentionQueueId]: BoundedCount };

export interface AttentionRow {
  readonly definition: AttentionQueueDefinition;
  readonly count: BoundedCount;
  /** There is work here. Drives whether the row is shown at all. */
  readonly actionable: boolean;
  /** The scan failed. Shown as prominently as work, never as a zero. */
  readonly unknown: boolean;
}

export interface AttentionSummary {
  /** Every queue, in `ATTENTION_QUEUES` order. */
  readonly rows: readonly AttentionRow[];
  /** Queues with something in them. */
  readonly actionable: readonly AttentionRow[];
  /** Queues that could not be read. */
  readonly unknown: readonly AttentionRow[];
  /**
   * Safe to tell an operator there is nothing to do.
   *
   * Requires every queue to have answered *and* answered zero. One failed scan
   * makes this false, because the honest headline then is "we could not check",
   * and an operator who reads "all clear" walks away from a real backlog.
   */
  readonly allClear: boolean;
}

export function summariseAttention(counts: AttentionCounts): AttentionSummary {
  const rows: AttentionRow[] = ATTENTION_QUEUES.map((definition) => {
    const count = counts[definition.id];
    return {
      definition,
      count,
      actionable: count.ok && count.count > 0,
      unknown: !count.ok,
    };
  });

  return {
    rows,
    actionable: rows.filter((row) => row.actionable),
    unknown: rows.filter((row) => row.unknown),
    allClear: rows.every((row) => row.count.ok && row.count.count === 0),
  };
}

/* ------------------------------------------------------------------ *
 * Payment holds
 * ------------------------------------------------------------------ */

/**
 * Minutes left before a hold is unusable, and whether it already is.
 *
 * `holdExpiresAt` is read from the booking rather than recomputed, because the
 * two write paths disagree about how long a hold lasts: `BOOKING_LIFETIME_MS` in
 * `@/shared/constants` is 15 minutes, while `RescheduleBookingCommand` sets a
 * fresh hold 10 minutes out. Deriving a deadline here would contradict the
 * document for one of them.
 *
 * `unknown` is its own state and matters: plenty of bookings carry no
 * `holdExpiresAt` at all, and calling those lapsed would invent a backlog.
 */
export type HoldState =
  | { readonly kind: 'lapsed'; readonly minutes: number }
  | { readonly kind: 'expiring'; readonly minutes: number }
  | { readonly kind: 'holding'; readonly minutes: number }
  | { readonly kind: 'unknown' };

/** Inside this many minutes, a hold is worth acting on before it lapses. */
export const HOLD_EXPIRING_SOON_MINUTES = 3;

export function classifyHold(holdExpiresAtIso: string | null, nowMs: number): HoldState {
  if (!holdExpiresAtIso) return { kind: 'unknown' };
  const expiresAt = Date.parse(holdExpiresAtIso);
  if (!Number.isFinite(expiresAt)) return { kind: 'unknown' };

  const deltaMs = expiresAt - nowMs;
  // `Math.max(0, …)` rather than the bare division: an exactly-expired hold would
  // otherwise carry `-0`, which formats as "-0 min" the moment anything prints it.
  if (deltaMs <= 0) return { kind: 'lapsed', minutes: Math.max(0, Math.floor(-deltaMs / 60_000)) };

  const minutes = Math.ceil(deltaMs / 60_000);
  return minutes <= HOLD_EXPIRING_SOON_MINUTES
    ? { kind: 'expiring', minutes }
    : { kind: 'holding', minutes };
}

export function describeHold(state: HoldState): string {
  switch (state.kind) {
    case 'lapsed':
      return state.minutes < 1
        ? 'Hold just lapsed'
        : `Hold lapsed ${formatDurationMinutes(state.minutes)} ago`;
    case 'expiring':
      return `Lapses in ${formatDurationMinutes(state.minutes)}`;
    case 'holding':
      return `${formatDurationMinutes(state.minutes)} left to pay`;
    case 'unknown':
      return 'No hold deadline recorded';
  }
}

/**
 * A span of minutes as an operator would say it: `45 min`, `2 hr 10 min`, `3 days`.
 *
 * Exported because every admin screen that ages something — a lapsed hold, a
 * stalled outbox, a refund nobody has paid — has to phrase it, and two screens
 * rounding the same span differently is the kind of small inconsistency that
 * makes an operator distrust both numbers.
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/* ------------------------------------------------------------------ *
 * Today's schedule
 * ------------------------------------------------------------------ */

export type SessionPhase = 'done' | 'now' | 'next' | 'later' | 'unknown';

export interface ScheduleEntry<TRow> {
  readonly row: TRow;
  readonly phase: SessionPhase;
  /** Epoch millis of the session start in IST, or `null` if unreadable. */
  readonly startMs: number | null;
}

export interface TodaySchedule<TRow> {
  /** In start-time order, with unreadable times last. */
  readonly entries: readonly ScheduleEntry<TRow>[];
  readonly total: number;
  readonly done: number;
  readonly inProgress: number;
  readonly remaining: number;
  /** Sessions whose stored date/time could not be turned into an instant. */
  readonly unreadable: number;
  readonly nextStartMs: number | null;
}

interface SchedulableRow {
  readonly date: string;
  readonly time: string;
}

/**
 * Today's sessions in the order they happen, each marked against the clock.
 *
 * Sorted here rather than in Firestore on purpose. Ordering by `time` would need
 * a `bookings(date, time)` composite index that this project does not declare,
 * and one IST day of sessions is a bounded set — tens of documents — so sorting
 * the fetched page is correct rather than merely convenient. It is *not* the same
 * as filtering a collection in memory, which is what this console was built to
 * stop doing: every document sorted here was already selected by an indexed
 * `date ==` query.
 *
 * `phase` is derived from the clock, never from `status`. A session whose slot
 * has passed reads as `done` even while its status is still `confirmed`, because
 * `session-completion` only runs every five minutes and an operator looking at
 * 11:47 does not care which cron tick has landed.
 */
export function orderTodaySchedule<TRow extends SchedulableRow>(
  rows: readonly TRow[],
  nowMs: number,
  sessionMinutes: number = SESSION_DURATION_MINUTES
): TodaySchedule<TRow> {
  const withStarts = rows.map((row) => ({ row, startMs: slotStartEpochMs(row.date, row.time) }));

  withStarts.sort((left, right) => {
    if (left.startMs === right.startMs) return 0;
    // Unreadable times sort last: they are exceptions to chase, not the schedule.
    if (left.startMs === null) return 1;
    if (right.startMs === null) return -1;
    return left.startMs - right.startMs;
  });

  const sessionMs = sessionMinutes * 60_000;
  let done = 0;
  let inProgress = 0;
  let unreadable = 0;
  let nextStartMs: number | null = null;
  let nextAssigned = false;

  const entries: ScheduleEntry<TRow>[] = withStarts.map(({ row, startMs }) => {
    if (startMs === null) {
      unreadable += 1;
      return { row, phase: 'unknown' as const, startMs: null };
    }
    if (nowMs >= startMs + sessionMs) {
      done += 1;
      return { row, phase: 'done' as const, startMs };
    }
    if (nowMs >= startMs) {
      inProgress += 1;
      return { row, phase: 'now' as const, startMs };
    }
    if (!nextAssigned) {
      nextAssigned = true;
      nextStartMs = startMs;
      return { row, phase: 'next' as const, startMs };
    }
    return { row, phase: 'later' as const, startMs };
  });

  return {
    entries,
    total: rows.length,
    done,
    inProgress,
    remaining: rows.length - done - inProgress - unreadable,
    unreadable,
    nextStartMs,
  };
}

/* ------------------------------------------------------------------ *
 * Background machinery
 * ------------------------------------------------------------------ */

/**
 * The oldest event still waiting that nothing is deliberately holding back.
 *
 * `nextAttemptAt` is the discriminator. A failed event goes back to `pending`
 * with a backoff up to an hour out (`calculateBackoffDelay`), so age alone would
 * flag a perfectly healthy retry as a stall. Only events whose backoff has
 * elapsed — or which never had one — count as overdue.
 */
export interface WaitingEvent {
  readonly createdAtIso: string | null;
  readonly nextAttemptAtIso: string | null;
  readonly status: string;
}

export interface OutboxObservation {
  /** Events at `pending` or `processing`, bounded by the scan limit. */
  readonly waiting: BoundedCount;
  /** Events at `dead`. Nothing will retry these. */
  readonly dead: BoundedCount;
  /** The scanned waiting events, used to find the oldest overdue one. */
  readonly sample: readonly WaitingEvent[];
}

export type MachineryVerdict = 'unknown' | 'idle' | 'working' | 'stalled';

export interface MachineryReading {
  readonly verdict: MachineryVerdict;
  readonly headline: string;
  readonly detail: readonly string[];
  /** Always shown. What this reading cannot tell you. */
  readonly caveat: string;
  /** Age in minutes of the oldest overdue waiting event, if there is one. */
  readonly oldestOverdueMinutes: number | null;
}

/**
 * How far behind the worker has to be before "waiting" becomes "stalled".
 *
 * `scheduled-jobs.yml` ticks every five minutes and GitHub delays runs under
 * load, so a few minutes of backlog is normal operation. Four missed ticks is
 * not.
 */
export const MACHINERY_STALL_MINUTES = 20;

/** The one thing this page genuinely cannot observe, stated every time. */
export const MACHINERY_CAVEAT =
  'Saarthi records no cron run log, so this is inferred from the events themselves rather than read from a heartbeat. A quiet queue means no work is waiting — it does not prove the scheduled jobs ran.';

export function readMachinery(observation: OutboxObservation, nowMs: number): MachineryReading {
  const { waiting, dead } = observation;

  if (!waiting.ok || !dead.ok) {
    return {
      verdict: 'unknown',
      headline: 'The background event queue could not be read.',
      detail: [
        !waiting.ok ? `Waiting events: ${waiting.reason}` : `Waiting events: ${formatBoundedCount(waiting)}.`,
        !dead.ok ? `Abandoned events: ${dead.reason}` : `Abandoned events: ${formatBoundedCount(dead)}.`,
      ],
      caveat: MACHINERY_CAVEAT,
      oldestOverdueMinutes: null,
    };
  }

  const oldestOverdueMinutes = oldestOverdueAgeMinutes(observation.sample, nowMs);
  const deadLine =
    dead.count === 0
      ? 'No events have been abandoned.'
      : `${formatBoundedCount(dead)} event${dead.count === 1 ? ' has' : 's have'} been abandoned after exhausting retries and will not be retried.`;

  if (waiting.count === 0) {
    return {
      verdict: 'idle',
      headline: 'No background events are waiting.',
      detail: ['Everything the platform queued has been processed or abandoned.', deadLine],
      caveat: MACHINERY_CAVEAT,
      oldestOverdueMinutes: null,
    };
  }

  const waitingLine = waiting.atLeast
    ? `At least ${waiting.count} events are waiting — the scan stopped at its limit, so the real backlog is larger.`
    : `${waiting.count} event${waiting.count === 1 ? '' : 's'} waiting.`;

  if (oldestOverdueMinutes !== null && oldestOverdueMinutes >= MACHINERY_STALL_MINUTES) {
    return {
      verdict: 'stalled',
      headline: `Events have been due for ${formatDurationMinutes(oldestOverdueMinutes)} without being processed.`,
      detail: [
        waitingLine,
        `The oldest event whose retry backoff has elapsed has been waiting ${formatDurationMinutes(oldestOverdueMinutes)}. The process-outbox job runs every five minutes, so this suggests it is not running or is failing.`,
        deadLine,
      ],
      caveat: MACHINERY_CAVEAT,
      oldestOverdueMinutes,
    };
  }

  return {
    verdict: 'working',
    headline: waiting.atLeast
      ? 'Background events are queued and the backlog is above the scan limit.'
      : `${waiting.count} background event${waiting.count === 1 ? '' : 's'} queued.`,
    detail: [
      waitingLine,
      oldestOverdueMinutes === null
        ? 'None of them are overdue — each is either fresh or inside its retry backoff.'
        : `The oldest overdue event has been waiting ${formatDurationMinutes(oldestOverdueMinutes)}, within the ${MACHINERY_STALL_MINUTES}-minute tolerance for a five-minute schedule.`,
      deadLine,
    ],
    caveat: MACHINERY_CAVEAT,
    oldestOverdueMinutes,
  };
}

function oldestOverdueAgeMinutes(sample: readonly WaitingEvent[], nowMs: number): number | null {
  let oldestCreatedAt: number | null = null;

  for (const event of sample) {
    if (event.nextAttemptAtIso) {
      const nextAttempt = Date.parse(event.nextAttemptAtIso);
      // Still inside its backoff, so waiting is the intended behaviour.
      if (Number.isFinite(nextAttempt) && nextAttempt > nowMs) continue;
    }
    const createdAt = event.createdAtIso ? Date.parse(event.createdAtIso) : NaN;
    if (!Number.isFinite(createdAt)) continue;
    if (oldestCreatedAt === null || createdAt < oldestCreatedAt) oldestCreatedAt = createdAt;
  }

  if (oldestCreatedAt === null) return null;
  return Math.max(0, Math.floor((nowMs - oldestCreatedAt) / 60_000));
}

export const machineryTone: Record<MachineryVerdict, AdminTone> = {
  unknown: 'warning',
  idle: 'neutral',
  working: 'info',
  stalled: 'danger',
};
