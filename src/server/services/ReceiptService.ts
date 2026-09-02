import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { firestorePaymentRepository } from '@/domains/payment/PaymentRepository';
import { buildReceipt, isReceiptable, type Receipt } from '@/domains/payment/Receipt';
import type { Booking } from '@/domains/booking/entities/Booking';

/**
 * Receipt reads, and the one place that decides whether a receipt may be shown.
 *
 * The Receipts page used to query Firestore directly from the browser
 * (`payments where userId == <uid>`) against a collection whose documents have no
 * `userId` field, so it was structurally incapable of returning anything. Moving
 * the read server-side fixes that and, more importantly, puts authorization
 * somewhere the client cannot influence: the browser never names the record it
 * wants to be allowed to see, it only presents its session.
 */

export interface ReceiptIdentity {
  uid: string;
  email?: string;
}

/**
 * The ownership rule, deliberately identical to the one
 * `CancelBookingCommand.readCancelPlan` enforces: a client owns a booking when
 * the verified uid matches `userId` (or the legacy `email`-as-uid form), or when
 * the verified session email matches the booking email case-insensitively. That
 * second arm matters because a guest booking stores only the email, and the same
 * person may later sign in with it.
 *
 * There is intentionally no admin or therapist bypass here. A support flow that
 * needs to re-send somebody's receipt belongs in an audited admin endpoint, not
 * in the route a client's browser calls, and adding the bypass here would make
 * "change the id in the URL" work for any staff account.
 */
export function ownsBookingForReceipt(booking: Booking, identity: ReceiptIdentity): boolean {
  const uid = identity.uid?.trim();
  const email = identity.email?.trim().toLowerCase();
  if (!uid && !email) return false;

  const ownsByUid = !!uid && (booking.userId === uid || booking.email === uid);
  const ownsByEmail = !!email && !!booking.email && booking.email.trim().toLowerCase() === email;
  return ownsByUid || ownsByEmail;
}

/** Newest paid session first — the order a receipt list is read in. */
function byPaymentRecencyDesc(a: Receipt, b: Receipt): number {
  const at = a.paidAtIso ? Date.parse(a.paidAtIso) : 0;
  const bt = b.paidAtIso ? Date.parse(b.paidAtIso) : 0;
  if (bt !== at) return bt - at;
  return `${b.sessionDate} ${b.sessionTime}`.localeCompare(`${a.sessionDate} ${a.sessionTime}`);
}

export class ReceiptService {
  /**
   * Resolves therapist display names in one round trip.
   *
   * `getAll` on a de-duplicated id list, so a client with twenty sessions with
   * the same therapist costs one read, not twenty. A missing therapist document
   * yields no entry and `buildReceipt` falls back to a neutral label rather than
   * printing an id.
   */
  private async resolveTherapistNames(ids: string[]): Promise<Record<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
    if (unique.length === 0 || !adminDb) return {};
    const refs = unique.map((id) => adminDb.collection('therapists').doc(id));
    const docs = await adminDb.getAll(...refs);
    const names: Record<string, string> = {};
    for (const doc of docs) {
      const name = doc.exists ? (doc.data()?.name as string | undefined) : undefined;
      if (name) names[doc.id] = name;
    }
    return names;
  }

  /**
   * Every receipt the signed-in client is entitled to.
   *
   * Derived from that client's own bookings, filtered to the ones whose money was
   * actually captured. Unpaid, failed and abandoned attempts are not receipts and
   * are not listed — a document headed "payment receipt" for a payment that never
   * completed would be a fabrication.
   */
  async listForClient(identity: ReceiptIdentity): Promise<Receipt[]> {
    const bookings = await firestoreBookingRepository.findByClient({
      uid: identity.uid,
      email: identity.email,
    });

    // Defence in depth: the queries already filter by owner, but the ownership
    // predicate is re-applied so this method can never widen if a query changes.
    const paid = bookings.filter((b) => isReceiptable(b) && ownsBookingForReceipt(b, identity));
    const therapistNames = await this.resolveTherapistNames(paid.map((b) => b.therapistId));

    const receipts: Receipt[] = [];
    for (const booking of paid) {
      const receipt = buildReceipt(booking, { therapistName: therapistNames[booking.therapistId] });
      if (receipt) receipts.push(receipt);
    }
    return receipts.sort(byPaymentRecencyDesc);
  }

  /**
   * One receipt, by booking id, for the signed-in client.
   *
   * Returns `null` for "no such booking", "not yours" and "not paid for" alike so
   * the caller answers 404 in every case. Distinguishing them would let anyone
   * enumerate which booking ids exist and which have been paid.
   *
   * The gateway `payments` document is loaded here (and only here) to supplement
   * the booking with the verified payment reference; the list view does not pay
   * for that read per row.
   */
  async getForClient(identity: ReceiptIdentity, bookingId: string): Promise<Receipt | null> {
    const id = bookingId?.trim();
    if (!id) return null;

    const booking = await firestoreBookingRepository.findById(id);
    if (!booking) return null;
    if (!ownsBookingForReceipt(booking, identity)) return null;
    if (!isReceiptable(booking)) return null;

    const [therapistNames, payment] = await Promise.all([
      this.resolveTherapistNames([booking.therapistId]),
      firestorePaymentRepository.findByBookingId(id).catch(() => null),
    ]);

    return buildReceipt(booking, {
      therapistName: therapistNames[booking.therapistId],
      payment,
    });
  }
}

export const receiptService = new ReceiptService();
