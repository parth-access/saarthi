/**
 * How a response from `GET /api/admin/overview` becomes what the landing page
 * shows — and, more importantly, what it refuses to show.
 *
 * This is the one screen an operator reads before deciding there is nothing to
 * do, so its failure modes are the dangerous ones:
 *
 *  - **A missing queue is not an empty queue.** The route returns six counts,
 *    each independently fallible. A count that came back `{ ok: false }` is a
 *    gap the UI must render as a gap. But a count that is *absent from the body
 *    altogether* — an older deploy, a truncated response, a proxy that rewrote
 *    the JSON — would read as `undefined` and could render as a dash beside five
 *    healthy zeroes. So the whole payload is rejected unless every queue named
 *    in {@link ATTENTION_QUEUES} is present and well-formed. A page that says
 *    "we could not load this" is recoverable; a page that says "all clear" while
 *    silently missing the refunds queue is not.
 *  - **A 200 that says `success: false` is a failure.** Trusting the status line
 *    alone would render the error body's absent fields as an empty day.
 *  - **The server's sentence wins on error.** The route composes its own copy and
 *    keeps raw Firestore errors — which carry the project id and an
 *    index-creation URL — in the server log, so whatever it sends is safe to
 *    display verbatim. A body that is not this shape falls back to generic copy.
 *
 * Kept out of the hook so it can be tested: this project has no DOM test
 * environment, and these rules are the part of the fetch path that can put a
 * false reassurance in front of an operator.
 */
import {
  ATTENTION_QUEUES,
  type AttentionCounts,
  type BoundedCount,
  type OutboxObservation,
  type WaitingEvent,
} from '@/domains/admin/overviewTriage';
import type { AdminBookingRow } from '@/domains/booking/queries/adminBookingQuery';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../bookings/adminBookingsResponse';

/** Today's bookings, split by the server into sessions and everything else. */
export type TodaySource =
  | {
      readonly ok: true;
      readonly sessions: readonly AdminBookingRow[];
      readonly other: readonly AdminBookingRow[];
      /** The day's scan filled its limit, so both lists may be incomplete. */
      readonly atLeast: boolean;
    }
  | { readonly ok: false; readonly reason: string };

export interface AdminOverviewPayload {
  readonly generatedAtIso: string;
  /** The operator's day in IST, decided by the server so the browser cannot differ. */
  readonly istDate: string;
  readonly attention: AttentionCounts;
  readonly notes: { readonly lapsed_holds: string | null };
  readonly today: TodaySource;
  readonly machinery: OutboxObservation;
  /** The per-scan document cap, so the UI can explain what "60+" means. */
  readonly scanLimit: number;
}

export type AdminOverviewInterpretation =
  | { readonly ok: true; readonly payload: AdminOverviewPayload }
  | { readonly ok: false; readonly error: string };

export const GENERIC_OVERVIEW_ERROR =
  'We could not load the overview right now. Please try again.';

export const OVERVIEW_ACCESS_ERROR =
  'Your session no longer has admin access. Sign in again to continue.';

export const OVERVIEW_SESSION_ERROR =
  'Your session has expired. Reload the page to sign in again.';

/** The `error` string a response body carries, if it carries a usable one. */
function messageIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

/**
 * A reading that either answered with a bounded number or admits it did not.
 *
 * `atLeast` is required on the success branch, not optional: it is what stops a
 * capped scan being read as a total, and a body that omits it would silently
 * turn "60 or more" into "60".
 */
function isBoundedCount(value: unknown): value is BoundedCount {
  if (!value || typeof value !== 'object') return false;
  const count = value as Record<string, unknown>;
  if (count.ok === true) {
    return typeof count.count === 'number' && typeof count.atLeast === 'boolean';
  }
  if (count.ok === false) {
    return typeof count.reason === 'string' && count.reason.trim().length > 0;
  }
  return false;
}

/**
 * Every queue this console knows about, present and well-formed.
 *
 * Driven by `ATTENTION_QUEUES` rather than a hand-written list of keys, so a
 * queue added to the triage model cannot be quietly accepted as missing here.
 */
function isAttentionCounts(value: unknown): value is AttentionCounts {
  if (!value || typeof value !== 'object') return false;
  const counts = value as Record<string, unknown>;
  return ATTENTION_QUEUES.every((queue) => isBoundedCount(counts[queue.id]));
}

function isWaitingEvent(value: unknown): value is WaitingEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    (event.createdAtIso === null || typeof event.createdAtIso === 'string') &&
    (event.nextAttemptAtIso === null || typeof event.nextAttemptAtIso === 'string') &&
    typeof event.status === 'string'
  );
}

function isMachinery(value: unknown): value is OutboxObservation {
  if (!value || typeof value !== 'object') return false;
  const machinery = value as Record<string, unknown>;
  return (
    isBoundedCount(machinery.waiting) &&
    isBoundedCount(machinery.dead) &&
    Array.isArray(machinery.sample) &&
    machinery.sample.every(isWaitingEvent)
  );
}

/**
 * The day, or an admitted failure to read it.
 *
 * The rows themselves are checked only for being arrays, matching the bookings
 * table: `orderTodaySchedule` already treats a row whose date or time will not
 * parse as unreadable and counts it separately, so a malformed row degrades into
 * a visible "time unreadable" entry rather than a wrong position in the day.
 */
function isTodaySource(value: unknown): value is TodaySource {
  if (!value || typeof value !== 'object') return false;
  const today = value as Record<string, unknown>;
  if (today.ok === true) {
    return (
      Array.isArray(today.sessions) &&
      Array.isArray(today.other) &&
      typeof today.atLeast === 'boolean'
    );
  }
  if (today.ok === false) {
    return typeof today.reason === 'string' && today.reason.trim().length > 0;
  }
  return false;
}

function isNotes(value: unknown): value is AdminOverviewPayload['notes'] {
  if (!value || typeof value !== 'object') return false;
  const notes = value as Record<string, unknown>;
  return notes.lapsed_holds === null || typeof notes.lapsed_holds === 'string';
}

/**
 * `status` and the parsed body — deliberately not a `Response`, so the rules are
 * assertable without constructing HTTP.
 *
 * `body` is `null` for a response that was not JSON at all (a proxy error page,
 * say), which tells an operator nothing and becomes the generic message.
 */
export function interpretAdminOverviewResponse(
  status: number,
  body: unknown
): AdminOverviewInterpretation {
  if (status === 401 || status === 403) {
    return { ok: false, error: OVERVIEW_ACCESS_ERROR };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: messageIn(body) ?? GENERIC_OVERVIEW_ERROR };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: GENERIC_OVERVIEW_ERROR };
  }
  const candidate = body as Record<string, unknown>;

  if (candidate.success === false) {
    return { ok: false, error: messageIn(body) ?? GENERIC_OVERVIEW_ERROR };
  }

  if (
    typeof candidate.generatedAtIso !== 'string' ||
    typeof candidate.istDate !== 'string' ||
    typeof candidate.scanLimit !== 'number' ||
    !isAttentionCounts(candidate.attention) ||
    !isNotes(candidate.notes) ||
    !isTodaySource(candidate.today) ||
    !isMachinery(candidate.machinery)
  ) {
    return { ok: false, error: GENERIC_OVERVIEW_ERROR };
  }

  return {
    ok: true,
    payload: {
      generatedAtIso: candidate.generatedAtIso,
      istDate: candidate.istDate,
      attention: candidate.attention,
      notes: candidate.notes,
      today: candidate.today,
      machinery: candidate.machinery,
      scanLimit: candidate.scanLimit,
    },
  };
}

export interface OverviewGaps {
  /** What could not be read, in the order the page presents it. */
  readonly labels: readonly string[];
  /** One sentence for the banner above the page. */
  readonly sentence: string;
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * What this overview could not see, as one sentence — or `null` when it saw
 * everything.
 *
 * A partial overview is the normal failure mode of this page (each source is
 * read independently and catches its own error), and the risk is that an
 * operator reads five queues at zero and stops. Naming the gaps at the top, and
 * saying the word "missing" rather than "zero", is what makes the difference
 * legible before they scroll.
 *
 * `events_abandoned` and `machinery.dead` are the same reading on the server, so
 * a failure there is named once — through the queue, which is where it is acted
 * on — and not repeated for the machinery panel.
 */
export function describeOverviewGaps(payload: AdminOverviewPayload): OverviewGaps | null {
  const labels: string[] = [];

  for (const queue of ATTENTION_QUEUES) {
    if (!payload.attention[queue.id].ok) labels.push(queue.label);
  }
  if (!payload.today.ok) labels.push("Today's schedule");
  if (!payload.machinery.waiting.ok) labels.push('Waiting background events');

  if (labels.length === 0) return null;

  const noun = labels.length === 1 ? 'reading' : 'readings';
  return {
    labels,
    sentence:
      `${labels.length} ${noun} could not be loaded: ${joinLabels(labels)}. ` +
      'Those figures are missing, not zero.',
  };
}
