/**
 * The refunds page's wording: how an amount, a queue and a bound are put into
 * words.
 *
 * Small, but kept out of the component and tested, because these are the
 * sentences an operator reconciles money against. Two rules run through all of
 * them:
 *
 *  - **An estimate never looks like a fact.** The only refund amount this console
 *    knows is one Razorpay already returned. Everything else is `refundPercent`
 *    applied to what the booking says was paid, and is marked as approximate with
 *    its basis stated — because the figure Razorpay refunds is a percentage of the
 *    *captured* amount, which is not guaranteed to equal the booking's field.
 *  - **A total never quietly omits a row.** A queue with one unpriceable refund in
 *    it reports the sum it could compute *and* says how many it could not, so the
 *    number is never read as the whole debt.
 */
import type {
  RefundAmountClaim,
  RefundQueueSummary,
  RefundStandingKind,
} from '@/domains/admin/refundTriage';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { formatDurationMinutes } from '@/domains/admin/overviewTriage';

/** Paise as rupees, two decimals only when the amount actually has them. */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface RefundAmountDisplay {
  /** What to render as the amount. Never a bare rupee figure for an estimate. */
  readonly text: string;
  /** Where the figure came from, or why there is none. Always shown. */
  readonly qualifier: string;
  /** True only when Razorpay returned this number. */
  readonly certain: boolean;
}

/**
 * An amount claim as an operator should read it.
 *
 * The `≈` and the word "estimate" are not politeness. `RefundService` computes
 * `floor(capturedPaise × percent / 100)` from what Razorpay reports as captured;
 * this console multiplies the booking's `paymentAmount` instead, because that is
 * all it has before the job runs. The two agree in the ordinary case and there is
 * no guarantee they agree in every case, so the figure is presented as what it is.
 */
export function refundAmountDisplay(claim: RefundAmountClaim): RefundAmountDisplay {
  switch (claim.kind) {
    case 'settled':
      return {
        text: formatPaise(claim.paise),
        qualifier: 'Returned by Razorpay. This is the amount that actually moved.',
        certain: true,
      };
    case 'estimated':
      return {
        text: `≈ ${formatPaise(claim.paise)}`,
        qualifier: `Estimate: ${claim.percent}% of the ₹${claim.basisRupees.toLocaleString('en-IN')} recorded on the booking. The job computes it from the amount Razorpay reports as captured, so the final figure comes from the gateway.`,
        certain: false,
      };
    case 'percent_only':
      return {
        text: `${claim.percent}% of the payment`,
        qualifier:
          'No amount is recorded on the booking, so this percentage cannot be turned into rupees here. The job will compute it from the captured amount at the gateway.',
        certain: false,
      };
    case 'unknown':
      return {
        text: 'Not known',
        qualifier:
          'Neither a refunded amount nor a usable percentage is stored on this document, so no figure can be worked out from it.',
        certain: false,
      };
  }
}

/**
 * The money owed, as one sentence — with what it leaves out attached.
 *
 * The unpriced clause is part of the same sentence rather than a footnote, because
 * the failure it prevents is somebody reading the total, writing it in a
 * reconciliation note, and never seeing the footnote.
 */
export function describeOutstandingMoney(summary: RefundQueueSummary): string {
  if (summary.outstanding === 0) {
    return 'No refund is waiting to be paid in what was scanned.';
  }

  const refunds = `${summary.outstanding} refund${summary.outstanding === 1 ? '' : 's'}`;

  if (summary.unpriced === summary.outstanding) {
    return `${refunds} owed. None of them could be priced from what is stored, so this console cannot say how much money that is.`;
  }

  const priced = `≈ ${formatPaise(summary.estimatedOutstandingPaise)} across ${refunds}`;
  if (summary.unpriced === 0) {
    return `${priced}. Every figure is an estimate until the job runs.`;
  }
  return `${priced}, of which ${summary.unpriced} could not be priced — so the real total is higher than this.`;
}

/** How long the longest-waiting refund has been waiting, or that nothing is. */
export function describeOldestWait(summary: RefundQueueSummary): string | null {
  if (summary.outstanding === 0) return null;
  if (summary.oldestOutstandingMinutes === null) {
    return 'None of them records when it was requested, so how long they have waited is unknown.';
  }
  return `Longest wait: ${formatDurationMinutes(summary.oldestOutstandingMinutes)}.`;
}

/** Standing kinds an operator groups together when scanning the queue. */
export const REFUND_STANDING_ORDER: readonly RefundStandingKind[] = [
  'blocked',
  'overdue',
  'retrying',
  'queued',
  'unrecognised',
  'settled',
];

const STANDING_PRESENTATION: Readonly<
  Record<RefundStandingKind, { readonly plural: string; readonly tone: AdminTone }>
> = {
  blocked: { plural: 'cannot succeed', tone: 'danger' },
  overdue: { plural: 'never attempted', tone: 'danger' },
  retrying: { plural: 'retrying', tone: 'warning' },
  queued: { plural: 'queued', tone: 'warning' },
  unrecognised: { plural: 'in a status this build does not know', tone: 'neutral' },
  settled: { plural: 'settled', tone: 'success' },
};

export interface StandingTally {
  readonly kind: RefundStandingKind;
  readonly count: number;
  readonly label: string;
  readonly tone: AdminTone;
}

/**
 * The queue broken down by standing, worst first, zeroes omitted.
 *
 * Ordered by severity rather than by count so the strip does not reorder itself
 * between two reads, and so "cannot succeed" — the only group that will still be
 * there tomorrow if nobody acts — is always first.
 */
export function tallyStandings(summary: RefundQueueSummary): readonly StandingTally[] {
  return REFUND_STANDING_ORDER.filter((kind) => summary.byStanding[kind] > 0).map((kind) => ({
    kind,
    count: summary.byStanding[kind],
    label: STANDING_PRESENTATION[kind].plural,
    tone: STANDING_PRESENTATION[kind].tone,
  }));
}

/**
 * What a filled scan means for this list.
 *
 * Worth its own sentence because the `refunds` query is unordered: a truncated
 * scan is an arbitrary subset, not the oldest N. An operator who reads it as "the
 * sixty oldest" would conclude the rest are newer, which is not something this
 * query can support.
 */
export function describeScanBound(atLeast: boolean, scanLimit: number): string | null {
  if (!atLeast) return null;
  return `The scan stops at ${scanLimit} documents and there were more. Because refunds cannot be ordered inside the query — this project declares no index on that collection — the ${scanLimit} shown are an arbitrary subset, not the oldest ${scanLimit}.`;
}
