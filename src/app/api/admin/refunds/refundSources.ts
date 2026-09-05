import { adminDb } from '@/lib/firebase/admin';
import { firestoreRefundRepository } from '@/domains/payment/FirestoreRefundRepository';
import type { RefundRequest } from '@/domains/payment/RefundRepository';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import {
  classifyRefundCause,
  compareOldestRequestedFirst,
  compareRecentlyUpdatedFirst,
  type AdminRefundBookingContext,
  type AdminRefundRow,
} from '@/domains/admin/refundTriage';
import { logger } from '../../_lib/logger';

/**
 * Reading the refunds queue out of Firestore.
 *
 * Four constraints shape every query below, and they are why this is a module
 * rather than a handler:
 *
 *  1. **There is no index on `refunds`.** `firestore.indexes.json` declares eight
 *     composite indexes and all eight are on `bookings`; `fieldOverrides` is
 *     empty. So nothing here may combine a filter with an `orderBy` — that needs
 *     a composite index this project would have to declare and deploy. What is
 *     available is single-field equality, served by the automatic index. Both
 *     reads below are therefore *unordered bounded scans*, sorted afterwards in
 *     memory by the pure comparators, and the bound is reported to the browser.
 *
 *  2. **The outstanding set is not re-derived.** It is read through
 *     `findRefundsNeedingProcessing`, the same repository method the five-minute
 *     cron calls, so the queue an operator reads is the queue the job will act
 *     on. A second hand-written query here could drift from it silently.
 *
 *  3. **`refunds.error` never reaches the browser.** It holds an arbitrary
 *     `Error.message` — a Razorpay body, a network error, or a Firestore
 *     `FAILED_PRECONDITION` carrying the project id and an index-creation URL.
 *     {@link classifyRefundCause} runs *here*, server-side, and only its closed
 *     union crosses the wire. The raw text goes to the server log.
 *
 *  4. **A failed source says so.** A source that cannot be read returns a fixed
 *     sentence, never zero and never the caught error. An operator who is shown
 *     "no refunds owed" when the truth is "the collection could not be read" will
 *     close the page and leave somebody unpaid.
 */

/** How many refund documents either scan may read. */
export const REFUND_SCAN_LIMIT = 60;

/**
 * The one sentence a failed source is allowed to say — same wording as the
 * overview's, for the same reason.
 */
const UNREADABLE = 'Could not be read just now. Reload to try again.';

/** A bounded list of rows, or a stated failure. Never a silent empty list. */
export type RefundScan =
  | { readonly ok: true; readonly rows: readonly AdminRefundRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

function failed(source: string, error: unknown): { ok: false; reason: string } {
  logger.error('PAYMENT', `Admin refunds source "${source}" failed`, error, { source });
  return { ok: false, reason: UNREADABLE };
}

/* ------------------------------------------------------------------ *
 * Refund document → wire row
 * ------------------------------------------------------------------ */

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Projects a stored refund onto the shape the browser gets.
 *
 * Every field is narrowed rather than passed through. `attempts` is coerced to a
 * finite number because a document written outside `RefundService` could hold
 * anything, and an `attempts` of `undefined` rendering as "undefined failed
 * attempts" is the sort of thing that makes an operator distrust the screen.
 * `error` is the field that is deliberately *not* carried: it is classified into
 * `cause` and then dropped.
 */
export function toAdminRefundRow(
  refund: RefundRequest,
  booking: AdminRefundBookingContext | null
): AdminRefundRow {
  return {
    id: refund.id,
    bookingId: trimmedOrNull(refund.bookingId),
    razorpayPaymentId: trimmedOrNull(refund.razorpayPaymentId),
    razorpayOrderId: trimmedOrNull(refund.razorpayOrderId),
    status: trimmedOrNull(refund.status) ?? 'unrecorded',
    reason: trimmedOrNull(refund.reason),
    refundPercent: finiteOrNull(refund.refundPercent),
    attempts: finiteOrNull(refund.attempts) ?? 0,
    refundId: trimmedOrNull(refund.refundId),
    amountRefundedPaise: finiteOrNull(refund.amountRefundedPaise),
    cause: classifyRefundCause(refund.error),
    requestedAtIso: isoOrNull(refund.createdAt),
    updatedAtIso: isoOrNull(refund.updatedAt),
    booking,
  };
}

/* ------------------------------------------------------------------ *
 * The booking join
 * ------------------------------------------------------------------ */

/**
 * The bookings behind a batch of refunds, in one round trip.
 *
 * `getAll` on a de-duplicated id list — the same idiom `ReceiptService` uses for
 * therapist names — so sixty refunds cost one read rather than sixty. A booking
 * that cannot be read yields no entry, and the row carries `booking: null`, which
 * {@link refundAnomalies} reports as a contradiction rather than hiding.
 *
 * Only the eight fields the refunds screen actually shows are copied out. A
 * refund row does not need a client's phone number or email to be operated on,
 * and the brief is explicit about not exposing personal data unnecessarily; the
 * booking detail page is where the full record lives, behind its own request.
 */
async function joinBookings(
  refunds: readonly RefundRequest[]
): Promise<Map<string, AdminRefundBookingContext>> {
  const joined = new Map<string, AdminRefundBookingContext>();
  if (!adminDb) return joined;

  const ids = Array.from(
    new Set(refunds.map((refund) => trimmedOrNull(refund.bookingId)).filter((id): id is string => !!id))
  );
  if (ids.length === 0) return joined;

  const refs = ids.map((id) => adminDb.collection('bookings').doc(id));
  const docs = await adminDb.getAll(...refs);

  for (const doc of docs) {
    if (!doc.exists) continue;
    const data = doc.data() ?? {};
    joined.set(doc.id, {
      clientName: trimmedOrNull(data.name),
      sessionDate: trimmedOrNull(data.date),
      sessionTime: trimmedOrNull(data.time),
      status: trimmedOrNull(data.status),
      paymentStatus: trimmedOrNull(data.paymentStatus),
      paymentAmountRupees: finiteOrNull(data.paymentAmount),
      currency: trimmedOrNull(data.paymentCurrency),
      refundStatus: trimmedOrNull(data.refundStatus),
    });
  }

  return joined;
}

async function rowsFor(
  refunds: readonly RefundRequest[],
  compare: (a: AdminRefundRow, b: AdminRefundRow) => number
): Promise<AdminRefundRow[]> {
  const bookings = await joinBookings(refunds);
  return refunds
    .map((refund) => {
      const bookingId = trimmedOrNull(refund.bookingId);
      return toAdminRefundRow(refund, bookingId ? bookings.get(bookingId) ?? null : null);
    })
    .sort(compare);
}

/* ------------------------------------------------------------------ *
 * The two scans
 * ------------------------------------------------------------------ */

/**
 * Refunds still owed: `PENDING` or `FAILED`, longest-waiting first.
 *
 * Reads `limit + 1` so the bound can be admitted, then shows at most `limit`.
 * Because the underlying query is unordered, a truncated scan is a truncated
 * *arbitrary* subset — not "the oldest sixty". The payload says so, and the
 * screen repeats it, since an operator who reads a bounded list as complete will
 * conclude the queue is shorter than it is.
 */
export async function readOutstandingRefunds(limit = REFUND_SCAN_LIMIT): Promise<RefundScan> {
  try {
    const found = await firestoreRefundRepository.findRefundsNeedingProcessing(limit + 1);
    const atLeast = found.length > limit;
    const rows = await rowsFor(found.slice(0, limit), compareOldestRequestedFirst);
    return { ok: true, rows, atLeast };
  } catch (error) {
    return failed('refunds_outstanding', error);
  }
}

/**
 * Refunds that have settled, most recently touched first.
 *
 * `status == 'PROCESSED'` is a single-field equality filter, served by the
 * automatic index. It cannot be ordered by `updatedAt` in the query for the
 * reason at the top of this file, so this is a bounded arbitrary slice of the
 * settled history sorted after the fact — useful for confirming a specific
 * refund landed, and explicitly not a ledger.
 */
export async function readSettledRefunds(limit = REFUND_SCAN_LIMIT): Promise<RefundScan> {
  if (!adminDb) return failed('refunds_settled', new Error('Firestore adminDb is not initialized.'));
  try {
    const snapshot = await adminDb
      .collection('refunds')
      .where('status', '==', 'PROCESSED')
      .limit(limit + 1)
      .get();

    const found: RefundRequest[] = snapshot.docs.map((doc) => {
      const data = doc.data() ?? {};
      return { id: doc.id, ...data } as RefundRequest;
    });
    const atLeast = found.length > limit;
    const rows = await rowsFor(found.slice(0, limit), compareRecentlyUpdatedFirst);
    return { ok: true, rows, atLeast };
  } catch (error) {
    return failed('refunds_settled', error);
  }
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export interface AdminRefundsPayload {
  readonly generatedAtIso: string;
  readonly outstanding: RefundScan;
  readonly settled: RefundScan;
  /** The per-scan document cap, so the UI can explain what a truncated list means. */
  readonly scanLimit: number;
}

/**
 * Both scans, concurrently, each free to fail alone.
 *
 * `Promise.all` is safe because neither reader rejects — they return their failure
 * as data. If the settled scan breaks, the money still owed is what an operator
 * came for and it still renders.
 */
export async function readAdminRefunds(now: Date = new Date()): Promise<AdminRefundsPayload> {
  const [outstanding, settled] = await Promise.all([
    readOutstandingRefunds(),
    readSettledRefunds(),
  ]);

  return {
    generatedAtIso: now.toISOString(),
    outstanding,
    settled,
    scanLimit: REFUND_SCAN_LIMIT,
  };
}
