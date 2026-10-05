/**
 * What a refund request means for the person still waiting for the money.
 *
 * A refund in this platform is a promise made by one process and kept by another.
 * `CancelBookingCommand` and `ConfirmBookingCommand` only *enqueue* a document in
 * `refunds`; the money moves later, when `/api/cron/process-refunds` calls
 * `RefundService.processRefund` against Razorpay. Everything between those two
 * moments is a client who has been told they will be refunded and has not been.
 * This module decides what the console is entitled to say about that gap.
 *
 * Four rules, each of them a thing that is easy to get wrong and invisible when
 * you do:
 *
 *  1. **The rupee amount of an unprocessed refund is not known.** Only the
 *     *percent* is stored at enqueue time; `RefundService` computes the paise from
 *     the amount Razorpay reports as captured, at the moment it runs. So a figure
 *     for a pending refund can only ever be an estimate against the booking's own
 *     recorded amount, and {@link refundAmountClaim} makes that distinction part
 *     of the type rather than a footnote — a settled amount and an estimated one
 *     are different shapes, so a renderer cannot print one as the other.
 *
 *  2. **"Will retry" and "will never work" look identical in the data.** Both are
 *     `status: 'FAILED'`. The difference is in the stored `error`, and it decides
 *     whether an operator should wait or intervene: a network blip resolves on the
 *     next five-minute tick, while a payment Razorpay reports as never captured
 *     will fail forever and needs a decision. {@link classifyRefundCause} reads
 *     that difference out of the message shape, and it runs **server-side** so the
 *     raw text — which may be a Firestore or gateway error carrying project
 *     identifiers — never reaches a browser.
 *
 *  3. **A pending refund that is old is evidence about the cron, not the refund.**
 *     `attempts` only ever increments inside `RefundService.fail`, so a `PENDING`
 *     document has by definition never been attempted. If it has been pending for
 *     four scheduled ticks, the honest reading is that the job is not running —
 *     stated as an inference, because Saarthi records no cron heartbeat anywhere.
 *
 *  4. **An unreadable or unrecognised row counts as money owed.** Anything this
 *     module cannot classify is reported as outstanding, never as settled. The
 *     failure that matters here is an operator closing the page believing nobody
 *     is waiting.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { formatDurationMinutes } from './overviewTriage';

/* ------------------------------------------------------------------ *
 * The wire shape
 * ------------------------------------------------------------------ */

/**
 * The little of the booking a refund row needs to be actionable.
 *
 * A refund document names a `bookingId` and nothing human. "₹900 owed on
 * bk_20260901_A1B2C3" is not something an operator can act on or discuss, so the
 * client's name and the session it was for are joined in.
 *
 * Deliberately not the email or the phone number: this is a queue, and the row
 * links to the booking, which is where contacting somebody starts. The booking's
 * own `paymentAmount` is here because it is the only basis available for pricing
 * a refund that has not been processed yet.
 *
 * `null` for the whole context means the booking could not be read — an orphaned
 * refund, which is itself worth surfacing rather than papering over.
 */
export interface AdminRefundBookingContext {
  readonly clientName: string | null;
  readonly sessionDate: string | null;
  readonly sessionTime: string | null;
  readonly status: string | null;
  readonly paymentStatus: string | null;
  /** Rupees, as stored on the booking. Not paise — see `formatRefundAmount`. */
  readonly paymentAmountRupees: number | null;
  readonly currency: string | null;
  /** The booking's own mirror of the refund outcome, written best-effort. */
  readonly refundStatus: string | null;
}

/**
 * Why the last refund attempt failed, in a form that is safe to send to a browser.
 *
 * The `refunds` document stores a raw `error` string: one of three sentences
 * `RefundService.fail` composes, or an arbitrary `Error.message` from the gateway
 * call, Firestore, or the network. The last of those cannot be shown — a
 * Firestore error names the project and links a console page — so the message is
 * reduced to one of these cases on the server and only the case travels.
 */
export type RefundCause =
  | { readonly kind: 'payment_unknown_at_gateway' }
  | { readonly kind: 'payment_not_captured'; readonly gatewayStatus: string | null }
  | { readonly kind: 'nothing_to_refund' }
  | { readonly kind: 'unclassified' };

/** One row of the refunds queue: stored facts, plus the joined booking. */
export interface AdminRefundRow {
  /** `refund_<razorpayPaymentId>` — deterministic, one per payment. */
  readonly id: string;
  readonly bookingId: string | null;
  readonly razorpayPaymentId: string | null;
  readonly razorpayOrderId: string | null;
  /** The stored value, not a normalised one, so an unknown status is visible. */
  readonly status: string;
  readonly reason: string | null;
  readonly refundPercent: number | null;
  readonly attempts: number;
  /** Razorpay's own refund reference, present only after a refund was issued. */
  readonly refundId: string | null;
  /** Paise, written from the gateway's response. */
  readonly amountRefundedPaise: number | null;
  /** Classified server-side; the raw `error` text never leaves the server. */
  readonly cause: RefundCause | null;
  readonly requestedAtIso: string | null;
  readonly updatedAtIso: string | null;
  readonly booking: AdminRefundBookingContext | null;
}

/* ------------------------------------------------------------------ *
 * Why it failed
 * ------------------------------------------------------------------ */

/**
 * The two messages `RefundService.fail` composes that carry a diagnosis.
 *
 * Matched as whole strings rather than by substring so a gateway error that
 * happens to contain similar words cannot be mistaken for one of ours. The
 * captured gateway status is constrained to a short lowercase word: it comes from
 * Razorpay's payment status, and anything that does not look like one is dropped
 * rather than forwarded to a browser.
 */
const NOT_CAPTURED = /^Payment not captured \(status=([a-z_]{1,24})\)$/;
const NOTHING_TO_REFUND = /^Computed refund amount is -?\d+ paise \(nothing to refund\)$/;
const PAYMENT_UNKNOWN = 'Payment not found at gateway';

/**
 * Reduces a stored `error` string to a case the browser may see.
 *
 * Runs on the server, once, at read time. `null` in means no failure has been
 * recorded, which is not the same as an unclassified one: a `FAILED` document
 * with no message gets `unclassified`, and a `PENDING` one gets `null`.
 */
export function classifyRefundCause(error: string | null | undefined): RefundCause | null {
  if (typeof error !== 'string') return null;
  const message = error.trim();
  if (message.length === 0) return null;

  if (message === PAYMENT_UNKNOWN) return { kind: 'payment_unknown_at_gateway' };
  if (NOTHING_TO_REFUND.test(message)) return { kind: 'nothing_to_refund' };

  const notCaptured = NOT_CAPTURED.exec(message);
  if (notCaptured) return { kind: 'payment_not_captured', gatewayStatus: notCaptured[1] };

  return { kind: 'unclassified' };
}

/**
 * Whether retrying can plausibly fix this, or whether a person has to decide.
 *
 * The distinction is the point of the whole page. A refund the cron will retry
 * needs patience; a refund whose payment Razorpay says was never captured will
 * fail on every tick until somebody looks at it, and the cron will go on trying
 * forever without ever telling anyone.
 */
export function causeNeedsAPerson(cause: RefundCause | null): boolean {
  if (!cause) return false;
  switch (cause.kind) {
    case 'payment_unknown_at_gateway':
    case 'payment_not_captured':
    case 'nothing_to_refund':
      return true;
    case 'unclassified':
      // Could be a network blip or a Razorpay outage; the retry is the right
      // first response, and `attempts` is what escalates it if it is not.
      return false;
  }
}

/** What the failure means, in terms an operator can act on. */
export function describeRefundCause(cause: RefundCause | null): string | null {
  if (!cause) return null;
  switch (cause.kind) {
    case 'payment_unknown_at_gateway':
      return 'Razorpay does not recognise the payment reference stored on this refund, so there is nothing for it to refund against. Retrying cannot change that.';
    case 'payment_not_captured':
      return cause.gatewayStatus
        ? `Razorpay reports the payment as "${cause.gatewayStatus}", not captured — no money was ever taken, so there is none to return. Retrying cannot change that.`
        : 'Razorpay reports the payment as not captured — no money was ever taken, so there is none to return. Retrying cannot change that.';
    case 'nothing_to_refund':
      return 'The amount worked out to zero paise against the captured payment, so no refund could be issued. Retrying cannot change that.';
    case 'unclassified':
      return 'The attempt failed for a reason this console does not classify. The exact message is in the server log; the job will try again.';
  }
}

/* ------------------------------------------------------------------ *
 * Where a refund stands
 * ------------------------------------------------------------------ */

/**
 * How long a refund may sit unattempted before that is evidence about the cron.
 *
 * `scheduled-jobs.yml` ticks every five minutes, and GitHub delays runs under
 * load, so a few minutes is normal. Four missed ticks is the same tolerance the
 * overview applies to the outbox, and for the same reason.
 */
export const REFUND_UNATTEMPTED_STALL_MINUTES = 20;

/**
 * Failed attempts after which "it is retrying" stops being reassuring.
 *
 * Below this, a failure with an unrecognised cause is most likely transient and
 * the next tick will clear it. At or above it, whatever is wrong is not clearing
 * itself, even though the cause is one this console cannot name.
 */
export const REFUND_RETRY_CONCERN_ATTEMPTS = 3;

export type RefundStandingKind =
  | 'queued'
  | 'overdue'
  | 'retrying'
  | 'blocked'
  | 'settled'
  | 'unrecognised';

export interface RefundStanding {
  readonly kind: RefundStandingKind;
  readonly label: string;
  readonly tone: AdminTone;
  /** What is true about this refund now. */
  readonly detail: string;
  /**
   * What happens next if nobody intervenes. Stated for every row, including the
   * settled ones, because "nothing further will happen" is the answer an operator
   * is looking for and the one a console usually leaves them to infer.
   */
  readonly next: string;
  /** Money this refund still owes somebody. Drives the queue and the totals. */
  readonly outstanding: boolean;
  readonly ageMinutes: number | null;
}

function ageMinutesSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  // Clamped at zero: a document written by a clock slightly ahead of this one
  // would otherwise read as "requested -1 min ago".
  return Math.max(0, Math.floor((nowMs - ms) / 60_000));
}

function agePhrase(ageMinutes: number | null): string {
  return ageMinutes === null ? 'at an unrecorded time' : `${formatDurationMinutes(ageMinutes)} ago`;
}

/**
 * Where one refund stands, from its stored status and the clock.
 *
 * `PENDING` is split by age rather than reported as one state, because the two
 * halves call for different responses: a refund queued four minutes ago is the
 * system working, and one queued four hours ago is the system not running.
 *
 * `FAILED` is split by cause rather than by attempt count first, because a
 * payment Razorpay says was never captured is already final on attempt one — the
 * attempt count only escalates the failures whose cause this console cannot read.
 *
 * A status outside the stored union is reported as outstanding. It is the
 * conservative reading, and it is the one that cannot cause somebody to be
 * forgotten: the alternative is a document quietly excluded from the money-owed
 * queue because a future deploy added a status this build has not heard of.
 */
export function refundStanding(row: AdminRefundRow, nowMs: number): RefundStanding {
  const ageMinutes = ageMinutesSince(row.requestedAtIso, nowMs);
  const requested = agePhrase(ageMinutes);

  if (row.status === 'PROCESSED') {
    return {
      kind: 'settled',
      label: 'Settled',
      tone: 'success',
      detail: `Requested ${requested} and settled against Razorpay.`,
      next: 'Nothing further will happen. The refunds job skips this document from now on.',
      outstanding: false,
      ageMinutes,
    };
  }

  if (row.status === 'PENDING') {
    if (ageMinutes !== null && ageMinutes >= REFUND_UNATTEMPTED_STALL_MINUTES) {
      return {
        kind: 'overdue',
        label: 'Never attempted',
        tone: 'danger',
        detail: `Requested ${requested} and still shows no attempt against the gateway.`,
        next: `The refunds job runs every five minutes, so ${formatDurationMinutes(ageMinutes)} without a first attempt suggests it is not running. Saarthi records no cron run log, so that is an inference from this document, not a reading of the job.`,
        outstanding: true,
        ageMinutes,
      };
    }
    return {
      kind: 'queued',
      label: 'Queued',
      tone: 'warning',
      detail: `Requested ${requested}. Not attempted yet.`,
      next: 'The refunds job runs every five minutes and will attempt this on its next tick.',
      outstanding: true,
      ageMinutes,
    };
  }

  if (row.status === 'FAILED') {
    const attempts = `${row.attempts} failed attempt${row.attempts === 1 ? '' : 's'}`;
    if (causeNeedsAPerson(row.cause)) {
      return {
        kind: 'blocked',
        label: 'Cannot succeed',
        tone: 'danger',
        detail: `Requested ${requested}. ${attempts}, and the reason will not clear on its own.`,
        next: 'The refunds job will keep retrying this every five minutes and keep failing. It needs a decision, not more time.',
        outstanding: true,
        ageMinutes,
      };
    }
    const concerning = row.attempts >= REFUND_RETRY_CONCERN_ATTEMPTS;
    return {
      kind: 'retrying',
      label: concerning ? 'Failing repeatedly' : 'Retrying',
      tone: concerning ? 'danger' : 'warning',
      detail: `Requested ${requested}. ${attempts}.`,
      next: concerning
        ? 'The refunds job will try again on its next tick, but it has already failed this many times, so something is not clearing itself.'
        : 'The refunds job will try again on its next tick.',
      outstanding: true,
      ageMinutes,
    };
  }

  return {
    kind: 'unrecognised',
    label: 'Unrecognised status',
    tone: 'neutral',
    detail: `Requested ${requested}. The stored status is "${row.status}", which is not one of PENDING, FAILED or PROCESSED.`,
    next: 'The refunds job only picks up PENDING and FAILED requests, so nothing will act on this. Counted as owed, because this console cannot show that it was paid.',
    outstanding: true,
    ageMinutes,
  };
}

/* ------------------------------------------------------------------ *
 * How much money
 * ------------------------------------------------------------------ */

/**
 * What the console may claim about the size of a refund.
 *
 * Three genuinely different epistemic positions, kept as three shapes so no
 * renderer can print an estimate in the column where facts go:
 *
 *  - `settled` — paise Razorpay actually returned, read back from its response.
 *  - `estimated` — the percent applied to the amount recorded *on the booking*.
 *    `RefundService` will compute the real figure from the amount Razorpay
 *    reports as captured, which is normally the same number and is occasionally
 *    not: a payment taken through a link, or one later adjusted, can differ from
 *    what the booking stored.
 *  - `percent_only` — a percent with no amount to apply it to. The honest output
 *    is "50% of the captured payment", not a rupee figure.
 */
export type RefundAmountClaim =
  | { readonly kind: 'settled'; readonly paise: number }
  | {
      readonly kind: 'estimated';
      readonly paise: number;
      readonly percent: number;
      readonly basisRupees: number;
    }
  | { readonly kind: 'percent_only'; readonly percent: number }
  | { readonly kind: 'unknown' };

/**
 * The estimated paise for a percent applied to a rupee amount.
 *
 * Deliberately the same arithmetic as `RefundService.processRefund` —
 * `floor(capturedPaise × percent / 100)` — written out rather than simplified, so
 * the correspondence is visible. The only difference is the base: the service
 * uses the paise Razorpay reports, this uses the rupees the booking recorded.
 */
export function estimateRefundPaise(basisRupees: number, percent: number): number {
  return Math.floor((basisRupees * 100 * percent) / 100);
}

/**
 * How much this refund is or was worth, and how sure the console is.
 *
 * A `PROCESSED` document with no recorded amount does **not** fall through to an
 * estimate. Estimating there would put a plausible number next to the word
 * "settled" and invite an operator to reconcile against it; the truth is that the
 * amount was not recorded, and {@link refundAnomalies} says so.
 */
export function refundAmountClaim(row: AdminRefundRow): RefundAmountClaim {
  if (row.status === 'PROCESSED') {
    return typeof row.amountRefundedPaise === 'number' && Number.isFinite(row.amountRefundedPaise)
      ? { kind: 'settled', paise: row.amountRefundedPaise }
      : { kind: 'unknown' };
  }

  // A refund already carrying a gateway amount while not marked processed is rare
  // but real — `RefundService` writes the amount and the status together, so this
  // is a partially applied write. The figure it holds is still a gateway figure.
  if (typeof row.amountRefundedPaise === 'number' && row.amountRefundedPaise > 0) {
    return { kind: 'settled', paise: row.amountRefundedPaise };
  }

  const percent = row.refundPercent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
    return { kind: 'unknown' };
  }

  const basis = row.booking?.paymentAmountRupees;
  if (typeof basis !== 'number' || !Number.isFinite(basis) || basis <= 0) {
    return { kind: 'percent_only', percent };
  }

  return {
    kind: 'estimated',
    paise: estimateRefundPaise(basis, percent),
    percent,
    basisRupees: basis,
  };
}

/* ------------------------------------------------------------------ *
 * Things that should not be true
 * ------------------------------------------------------------------ */

/**
 * Contradictions in a refund document, each stated as a sentence.
 *
 * These are not validation errors — the document is what it is, and the console's
 * job is to show it. They are the cases where two stored fields disagree, and
 * where an operator reconciling against Razorpay would otherwise be left to
 * notice the discrepancy themselves. Each one is reachable in this codebase:
 *
 *  - `PENDING` with attempts — `attempts` only increments in `RefundService.fail`,
 *    which also writes `FAILED`, so a pending document with attempts means a write
 *    landed partially or something outside that path edited it.
 *  - settled with no gateway reference — the reconcile branch marks a refund
 *    `PROCESSED` when Razorpay already reports the payment fully refunded, and it
 *    has no new refund id to record. Legitimate, and worth saying, because an
 *    operator searching Razorpay for a reference will not find one.
 *  - settled for zero — only reachable through the `refundPercent <= 0` guard,
 *    which no enqueue path can produce today (`CancelBookingCommand` only enqueues
 *    above 0%, double-bookings are always 100%).
 *  - a missing booking — the refund names a booking that could not be read.
 */
export function refundAnomalies(row: AdminRefundRow): readonly string[] {
  const notes: string[] = [];

  if (row.status === 'PENDING' && row.attempts > 0) {
    notes.push(
      `Recorded as pending, but ${row.attempts} attempt${row.attempts === 1 ? '' : 's'} ${row.attempts === 1 ? 'is' : 'are'} counted against it. Only a failed attempt increments that counter, so these two fields disagree.`
    );
  }

  if (row.status === 'PROCESSED') {
    if (typeof row.amountRefundedPaise !== 'number' || !Number.isFinite(row.amountRefundedPaise)) {
      notes.push('Marked settled, but no refunded amount was recorded. There is nothing here to reconcile against Razorpay.');
    } else if (row.amountRefundedPaise === 0) {
      notes.push('Marked settled with zero refunded. No money was returned.');
    }
    if (!row.refundId) {
      notes.push(
        'Settled without a Razorpay refund reference. This is what a reconciliation looks like: the gateway already reported the payment refunded, so no new refund was issued and there is no new reference to look up.'
      );
    }
  }

  if (typeof row.refundPercent !== 'number' || !Number.isFinite(row.refundPercent) || row.refundPercent <= 0) {
    notes.push('No usable refund percent is stored, so the amount owed cannot be worked out from this document.');
  }

  if (!row.bookingId) {
    notes.push('This refund names no booking.');
  } else if (row.booking === null) {
    notes.push(`Booking ${row.bookingId} could not be read, so there is no client or session behind this refund.`);
  }

  return notes;
}

/* ------------------------------------------------------------------ *
 * Why the refund exists
 * ------------------------------------------------------------------ */

export interface RefundReasonReading {
  readonly label: string;
  readonly tone: AdminTone;
  readonly detail: string;
}

/**
 * What the stored `reason` tells an operator about the situation behind the money.
 *
 * The two reasons are not variations on a theme. A `cancellation` refund follows a
 * session somebody chose to cancel, and the percent was decided by
 * `RefundPolicy.computeRefundPercent` at that moment. A `double_booking` refund
 * means `ConfirmBookingCommand` captured a payment and then found the slot already
 * confirmed for somebody else, so it refused to confirm: **that client paid and
 * has no session at all**, and nothing else in the platform will give them one.
 * Reading the second as "a refund" understates it, so the row says what happened.
 */
export function describeRefundReason(reason: string | null): RefundReasonReading {
  switch (reason) {
    case 'cancellation':
      return {
        label: 'Cancellation',
        tone: 'info',
        detail:
          'The session was cancelled after being paid for. The percent was fixed by the cancellation policy at the moment of cancellation and is not recalculated later.',
      };
    case 'double_booking':
      return {
        label: 'Double booking',
        tone: 'danger',
        detail:
          'The payment was captured but the slot had already been confirmed for someone else, so this booking was never confirmed. The client paid and has no session. Always refunded in full.',
      };
    default:
      return {
        label: reason && reason.trim().length > 0 ? reason : 'No reason recorded',
        tone: 'neutral',
        detail: reason
          ? `Stored reason "${reason}" is not one this console knows about. It was written by a path this build does not recognise.`
          : 'This refund records no reason, so why it was raised cannot be read from the document.',
      };
  }
}

/* ------------------------------------------------------------------ *
 * Ordering
 * ------------------------------------------------------------------ */

/**
 * Longest-waiting first.
 *
 * The queue has to be sorted here rather than by Firestore: the only query that
 * selects outstanding refunds is `status in ['PENDING','FAILED']`, and ordering
 * that by `createdAt` needs a `refunds(status, createdAt)` composite index which
 * `firestore.indexes.json` does not declare — it declares eight, all on
 * `bookings`. Sorting a bounded scan is the alternative that needs no deploy.
 *
 * A row with no readable `createdAt` sorts last. It cannot be placed in the
 * sequence honestly, and putting it first would let an undated document sit at the
 * top of a queue ordered by urgency.
 */
export function compareOldestRequestedFirst(a: AdminRefundRow, b: AdminRefundRow): number {
  const left = a.requestedAtIso ? Date.parse(a.requestedAtIso) : NaN;
  const right = b.requestedAtIso ? Date.parse(b.requestedAtIso) : NaN;
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  if (!leftOk && !rightOk) return a.id.localeCompare(b.id);
  if (!leftOk) return 1;
  if (!rightOk) return -1;
  if (left !== right) return left - right;
  return a.id.localeCompare(b.id);
}

/** Most recently touched first — the order settled refunds are read in. */
export function compareRecentlyUpdatedFirst(a: AdminRefundRow, b: AdminRefundRow): number {
  const left = a.updatedAtIso ? Date.parse(a.updatedAtIso) : NaN;
  const right = b.updatedAtIso ? Date.parse(b.updatedAtIso) : NaN;
  const leftOk = Number.isFinite(left);
  const rightOk = Number.isFinite(right);
  if (!leftOk && !rightOk) return a.id.localeCompare(b.id);
  if (!leftOk) return 1;
  if (!rightOk) return -1;
  if (left !== right) return right - left;
  return a.id.localeCompare(b.id);
}

/* ------------------------------------------------------------------ *
 * The headline
 * ------------------------------------------------------------------ */

export interface RefundQueueSummary {
  readonly total: number;
  readonly outstanding: number;
  readonly byStanding: Readonly<Record<RefundStandingKind, number>>;
  /** Age of the longest-waiting outstanding refund, in minutes. */
  readonly oldestOutstandingMinutes: number | null;
  /**
   * Paise this console can put a number on, summed. An estimate by construction —
   * see {@link refundAmountClaim} — and never the whole picture on its own, which
   * is why `unpriced` travels beside it.
   */
  readonly estimatedOutstandingPaise: number;
  /** Outstanding refunds whose size could not be worked out at all. */
  readonly unpriced: number;
  /** Outstanding refunds that retrying cannot fix. */
  readonly needsAPerson: number;
}

const EMPTY_STANDING_COUNTS: Readonly<Record<RefundStandingKind, number>> = {
  queued: 0,
  overdue: 0,
  retrying: 0,
  blocked: 0,
  settled: 0,
  unrecognised: 0,
};

/**
 * The numbers the top of the page states, computed from the rows it is showing.
 *
 * Deliberately derived from the fetched rows rather than from a separate count
 * query. A second query could answer a different question than the table below it
 * — the classic console failure where a header says 12 and the list has 9 — and
 * the scan is already bounded, so the header's own honesty problem is the bound,
 * which the payload reports separately.
 *
 * `estimatedOutstandingPaise` and `unpriced` are a pair on purpose. A total that
 * silently omitted the refunds it could not price would read as the money owed
 * while being less than it.
 */
export function summariseRefundQueue(
  rows: readonly AdminRefundRow[],
  nowMs: number
): RefundQueueSummary {
  const byStanding: Record<RefundStandingKind, number> = { ...EMPTY_STANDING_COUNTS };
  let outstanding = 0;
  let oldestOutstandingMinutes: number | null = null;
  let estimatedOutstandingPaise = 0;
  let unpriced = 0;
  let needsAPerson = 0;

  for (const row of rows) {
    const standing = refundStanding(row, nowMs);
    byStanding[standing.kind] += 1;
    if (!standing.outstanding) continue;

    outstanding += 1;
    if (
      standing.ageMinutes !== null &&
      (oldestOutstandingMinutes === null || standing.ageMinutes > oldestOutstandingMinutes)
    ) {
      oldestOutstandingMinutes = standing.ageMinutes;
    }
    if (causeNeedsAPerson(row.cause)) needsAPerson += 1;

    const claim = refundAmountClaim(row);
    if (claim.kind === 'settled' || claim.kind === 'estimated') {
      estimatedOutstandingPaise += claim.paise;
    } else {
      unpriced += 1;
    }
  }

  return {
    total: rows.length,
    outstanding,
    byStanding,
    oldestOutstandingMinutes,
    estimatedOutstandingPaise,
    unpriced,
    needsAPerson,
  };
}
