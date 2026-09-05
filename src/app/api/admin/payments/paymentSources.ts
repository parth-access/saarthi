import { adminDb } from '@/lib/firebase/admin';
import {
  firestorePaymentRepository,
  PaymentMapper,
} from '@/domains/payment/PaymentRepository';
import type { Payment } from '@/domains/payment/Payment';
import { deriveReceiptNumber } from '@/domains/payment/Receipt';
import { isoOrNull } from '@/domains/booking/queries/adminBookingQuery';
import { toStandardDate } from '@/shared/utils/dateTime';
import type { AdminPaymentBooking, AdminPaymentDoc } from '@/domains/admin/paymentTrace';
import { logger } from '../../_lib/logger';

/**
 * Reading the two sides of a payment out of Firestore.
 *
 * The screen this feeds has one honest job — put the `payments` document and the
 * booking side by side so their disagreements show — and two constraints shape
 * every read below:
 *
 *  1. **The `payments` collection is not the payment ledger; the booking is.** A
 *     document exists there only for the gateway-order flow, keyed by the Razorpay
 *     order id, and carries no `userId`. A payment made through a link, a mock, or
 *     before that collection existed has no document at all. So a trace resolves
 *     *both* sides independently and hands them to `reconcilePayment`, which is
 *     where the reconciliation logic lives and is tested.
 *  2. **No index on `payments`.** `firestore.indexes.json` declares composite
 *     indexes on `bookings` only. Every read here is therefore single-field
 *     equality (auto-indexed) or a single-field `orderBy` (also auto-indexed) —
 *     never the two combined, which would need an index this project has not
 *     declared. The recent-orders list is an unordered-by-anything-else bounded
 *     scan and admits its bound.
 *
 * The receipt *number* is derived here because `deriveReceiptNumber` needs
 * `node:crypto` and cannot cross into the browser bundle; whether a receipt
 * actually exists is decided client-side by `reconcilePayment`.
 */

/** How many recent gateway orders the list may read. */
export const PAYMENT_SCAN_LIMIT = 40;

/** The one sentence a failed read is allowed to say — matches the refunds page. */
const UNREADABLE = 'Could not be read just now. Reload to try again.';

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/* ------------------------------------------------------------------ *
 * Projections: stored record → the client-safe trace inputs
 * ------------------------------------------------------------------ */

/** A `payments` document narrowed to what a trace reads. Amounts are rupees. */
function toPaymentDoc(payment: Payment): AdminPaymentDoc {
  return {
    orderId: payment.id,
    bookingId: trimmedOrNull(payment.bookingId),
    status: trimmedOrNull(payment.status),
    amountRupees: finiteOrNull(payment.amount),
    currency: trimmedOrNull(payment.currency),
    razorpayOrderId: trimmedOrNull(payment.razorpayOrderId),
    razorpayPaymentId: trimmedOrNull(payment.razorpayPaymentId),
    source: trimmedOrNull(payment.source),
    createdAtIso: isoOrNull(payment.createdAt),
    verifiedAtIso: isoOrNull(payment.verifiedAt),
    refundedAtIso: isoOrNull(payment.refundedAt),
  };
}

/**
 * The booking's own payment view. `amountRupees` is rupees (`paymentAmount`);
 * `refundAmountPaise` is paise (`refundAmount`) — the two live in different units
 * and are carried in their stored unit, converted only at the presentation edge.
 *
 * A trace is the "named one" case — an operator has pasted a specific id — so the
 * client's name and email are carried, as they are on the booking detail view.
 * The recent-orders list below deliberately carries neither.
 */
function toPaymentBooking(id: string, data: Record<string, unknown>): AdminPaymentBooking {
  return {
    id,
    clientName: trimmedOrNull(data.name),
    clientEmail: trimmedOrNull(data.email),
    sessionDate: trimmedOrNull(data.date),
    sessionTime: trimmedOrNull(data.time),
    sessionType: trimmedOrNull(data.sessionType),
    bookingStatus: trimmedOrNull(data.status),
    paymentStatus: trimmedOrNull(data.paymentStatus),
    amountRupees: finiteOrNull(data.paymentAmount),
    currency: trimmedOrNull(data.paymentCurrency),
    razorpayOrderId: trimmedOrNull(data.razorpayOrderId),
    razorpayPaymentId: trimmedOrNull(data.razorpayPaymentId),
    paidAtIso: isoOrNull(data.paymentVerifiedAt),
    refundStatus: trimmedOrNull(data.refundStatus),
    refundId: trimmedOrNull(data.refundId),
    refundAmountPaise: finiteOrNull(data.refundAmount),
    refundedAtIso: isoOrNull(data.refundedAt),
  };
}

/**
 * The receipt number, derived from identifiers that never change — the same pure
 * function the client-facing receipt uses, so a number shown here and one printed
 * on the PDF cannot drift. Whether the number is *shown* is `reconcilePayment`'s
 * call, made client-side; this only computes it whenever a booking exists.
 */
function receiptNumberFor(
  bookingId: string,
  data: Record<string, unknown>,
  payment: Payment | null
): string {
  const paidAt =
    toStandardDate(data.paymentVerifiedAt) ??
    toStandardDate(payment?.verifiedAt) ??
    toStandardDate(payment?.createdAt) ??
    toStandardDate(data.createdAt);
  const orderId = trimmedOrNull(data.razorpayOrderId) ?? (payment ? trimmedOrNull(payment.razorpayOrderId) : null);
  return deriveReceiptNumber(bookingId, orderId, paidAt);
}

/* ------------------------------------------------------------------ *
 * Resolving one id to its two sides
 * ------------------------------------------------------------------ */

type BookingHit = { readonly id: string; readonly data: Record<string, unknown> };

async function readBookingById(id: string): Promise<BookingHit | null> {
  if (!adminDb) return null;
  const doc = await adminDb.collection('bookings').doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> };
}

async function readBookingByField(field: string, value: string): Promise<BookingHit | null> {
  if (!adminDb) return null;
  const snapshot = await adminDb.collection('bookings').where(field, '==', value).limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc) return null;
  return { id: doc.id, data: (doc.data() ?? {}) as Record<string, unknown> };
}

async function readPaymentByField(field: string, value: string): Promise<Payment | null> {
  if (!adminDb) return null;
  const snapshot = await adminDb.collection('payments').where(field, '==', value).limit(1).get();
  const doc = snapshot.docs[0];
  if (!doc || !doc.data()) return null;
  return PaymentMapper.toEntity(doc);
}

/**
 * One id, dispatched by its prefix to the two collections.
 *
 * `pay_` and `order_` are Razorpay's own prefixes; anything else is treated as a
 * booking id (`bk_…`), with a final fallback that reads a `payments` document
 * keyed by the raw string, so an order id pasted without its prefix still
 * resolves. Every branch is single-field equality or a direct doc read — no
 * combination that would need an index this project lacks.
 */
async function resolveTrace(
  query: string
): Promise<{ payment: Payment | null; booking: BookingHit | null }> {
  if (/^pay_/i.test(query)) {
    const [payment, booking] = await Promise.all([
      readPaymentByField('razorpayPaymentId', query),
      readBookingByField('razorpayPaymentId', query),
    ]);
    return { payment, booking };
  }
  if (/^order_/i.test(query)) {
    const [byId, booking] = await Promise.all([
      firestorePaymentRepository.findById(query),
      readBookingByField('razorpayOrderId', query),
    ]);
    const payment = byId ?? (await firestorePaymentRepository.findByOrderId(query));
    return { payment, booking };
  }
  const booking = await readBookingById(query);
  if (booking) {
    const payment = await firestorePaymentRepository.findByBookingId(booking.id);
    return { payment, booking };
  }
  // Not a booking id — a payments doc may still be keyed by this exact string.
  const payment = await firestorePaymentRepository.findById(query);
  return { payment, booking: null };
}

/* ------------------------------------------------------------------ *
 * The trace
 * ------------------------------------------------------------------ */

/**
 * The inputs a trace hands the browser. `reconcilePayment` runs client-side over
 * these three, so a body with `payment: null, booking: null` is not an error — it
 * is a query that matched nothing, which the screen states as such.
 */
export type AdminPaymentTraceResult =
  | {
      readonly ok: true;
      readonly query: string;
      readonly payment: AdminPaymentDoc | null;
      readonly booking: AdminPaymentBooking | null;
      readonly receiptNumber: string | null;
    }
  | { readonly ok: false; readonly query: string; readonly reason: string };

export async function readPaymentTrace(query: string): Promise<AdminPaymentTraceResult> {
  const q = query.trim();
  try {
    const { payment, booking } = await resolveTrace(q);
    return {
      ok: true,
      query: q,
      payment: payment ? toPaymentDoc(payment) : null,
      booking: booking ? toPaymentBooking(booking.id, booking.data) : null,
      receiptNumber: booking ? receiptNumberFor(booking.id, booking.data, payment) : null,
    };
  } catch (error) {
    // The raw error — a Firestore FAILED_PRECONDITION carrying the project id, say
    // — stays in the server log; the browser gets the fixed sentence.
    logger.error('PAYMENT', 'Admin payment trace failed to read', error);
    return { ok: false, query: q, reason: UNREADABLE };
  }
}

/* ------------------------------------------------------------------ *
 * Recent gateway orders
 * ------------------------------------------------------------------ */

/**
 * One row of the recent-orders list. Gateway-order fields only — no client name
 * or email — because this is a bulk list, and the brief is explicit about not
 * exposing personal data in one. To see who a payment belongs to, trace it.
 */
export interface AdminPaymentOrderRow {
  readonly orderId: string;
  readonly bookingId: string | null;
  readonly status: string | null;
  readonly amountRupees: number | null;
  readonly currency: string | null;
  readonly razorpayPaymentId: string | null;
  readonly source: string | null;
  readonly createdAtIso: string | null;
}

export type PaymentScan =
  | { readonly ok: true; readonly rows: readonly AdminPaymentOrderRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

function failed(source: string, error: unknown): { ok: false; reason: string } {
  logger.error('PAYMENT', `Admin payments source "${source}" failed`, error, { source });
  return { ok: false, reason: UNREADABLE };
}

/**
 * The most recent gateway orders, newest first.
 *
 * `orderBy('createdAt','desc')` is a single-field sort, served by the automatic
 * index — the one ordering `payments` can do without a declared composite index.
 * Reads `limit + 1` so the bound can be admitted. This is every payment the
 * gateway-order flow wrote, and explicitly not every paid session: a link, mock
 * or legacy payment has no document here, so the screen says so.
 */
export async function readRecentOrders(limit = PAYMENT_SCAN_LIMIT): Promise<PaymentScan> {
  if (!adminDb) return failed('payments_recent', new Error('Firestore adminDb is not initialized.'));
  try {
    const snapshot = await adminDb
      .collection('payments')
      .orderBy('createdAt', 'desc')
      .limit(limit + 1)
      .get();

    const atLeast = snapshot.docs.length > limit;
    const rows: AdminPaymentOrderRow[] = snapshot.docs.slice(0, limit).map((doc) => {
      const data = doc.data() ?? {};
      return {
        orderId: doc.id,
        bookingId: trimmedOrNull(data.bookingId),
        status: trimmedOrNull(data.status),
        amountRupees: finiteOrNull(data.amount),
        currency: trimmedOrNull(data.currency),
        razorpayPaymentId: trimmedOrNull(data.razorpayPaymentId),
        source: trimmedOrNull(data.source),
        createdAtIso: isoOrNull(data.createdAt),
      };
    });
    return { ok: true, rows, atLeast };
  } catch (error) {
    return failed('payments_recent', error);
  }
}

/* ------------------------------------------------------------------ *
 * Assembly
 * ------------------------------------------------------------------ */

export interface AdminPaymentsPayload {
  readonly generatedAtIso: string;
  /** `null` when no trace query was given — the page opened without a search. */
  readonly trace: AdminPaymentTraceResult | null;
  readonly recent: PaymentScan;
  readonly scanLimit: number;
}

/**
 * The trace (if a query was given) and the recent list, concurrently. Neither
 * reader rejects — each returns its failure as data — so a broken recent scan
 * still lets a trace through, and vice versa.
 */
export async function readAdminPayments(
  query: string | null,
  now: Date = new Date()
): Promise<AdminPaymentsPayload> {
  const trimmed = query?.trim() ?? '';
  const [trace, recent] = await Promise.all([
    trimmed.length > 0 ? readPaymentTrace(trimmed) : Promise.resolve<AdminPaymentTraceResult | null>(null),
    readRecentOrders(),
  ]);

  return { generatedAtIso: now.toISOString(), trace, recent, scanLimit: PAYMENT_SCAN_LIMIT };
}
