/**
 * One booking, as an operator needs to see it, and the history that explains how
 * it got there.
 *
 * The list projection (`toAdminBookingRow`) deliberately withholds per-client
 * detail, because a list hands out hundreds of records at once. A detail view is
 * the opposite situation: an operator has named one booking, the read is
 * attributable, and withholding the Meet link or the Razorpay reference just
 * sends them to the Firestore console instead. So this projection is wider —
 * with two deliberate exceptions:
 *
 *  - **`bookingToken` never leaves the server.** It is a bearer credential: the
 *    manage-booking links let anyone holding it reschedule or cancel without
 *    signing in (`/api/manage-booking`, `isTokenFlow`). Only its existence and
 *    whether it has been invalidated are reported.
 *  - **The client's booking note is not sent.** It is what somebody wrote about
 *    why they are seeking therapy, it is read by the assigned therapist, and no
 *    operational task on this screen needs it. Its presence is reported so an
 *    operator knows a note exists and is not left guessing.
 *
 * Both are decisions, not oversights; if the note turns out to be needed for
 * support work it belongs behind its own audited read, not in a general
 * projection.
 */
import type { BookingStatus } from '@/types';
import { BookingStateMachine } from '../state/BookingStateMachine';
import {
  bookingStatusGroupFor,
  isoOrNull,
  paymentStatusGroupFor,
  type BookingStatusGroupId,
  type PaymentStatusGroupId,
} from './adminBookingQuery';

/** The subset of a booking document this projection reads. */
export interface AdminBookingDetailSource {
  id: string;
  status?: string;
  paymentStatus?: string;
  name?: string;
  email?: string;
  phone?: string;
  userId?: string;
  gender?: string;
  age?: number;
  therapistId?: string;
  date?: string;
  time?: string;
  utcDateTime?: string;
  sessionType?: string;
  sessionMode?: string;
  message?: string;
  paymentAmount?: number;
  paymentCurrency?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  paymentVerifiedAt?: unknown;
  meetingUrl?: string;
  googleCalendarEventId?: string;
  calendarStatus?: string;
  calendarError?: string;
  calendarCreatedAt?: unknown;
  reminderStatus?: string;
  reminderSentAt?: unknown;
  reminderError?: string;
  emailStatus?: string;
  emailAttempts?: number;
  lastEmailError?: string;
  refundStatus?: string;
  refundId?: string;
  refundAmount?: number;
  refundedAt?: unknown;
  cancellationOrRejectionReason?: string;
  declineReason?: string;
  declineCustomNote?: string;
  declinedAt?: unknown;
  declinedBy?: string;
  noShowReason?: string;
  originalDate?: string;
  originalTime?: string;
  rescheduledAt?: unknown;
  rescheduleHistory?: unknown[];
  bookingToken?: string;
  invalidToken?: boolean;
  holdExpiresAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  reviewRating?: number;
  reviewComment?: string;
}

export interface AdminRescheduleRecord {
  readonly previousDate: string;
  readonly previousTime: string;
  readonly newDate: string;
  readonly newTime: string;
  readonly atIso: string | null;
  readonly reason: string | null;
}

export interface AdminBookingDetail {
  readonly id: string;
  readonly status: string;
  readonly statusGroup: BookingStatusGroupId | null;
  readonly paymentStatus: string | null;
  readonly paymentGroup: PaymentStatusGroupId | null;

  readonly client: {
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    /** Set when the booking was made by a signed-in account; absent for guests. */
    readonly userId: string | null;
    readonly gender: string | null;
    readonly age: number | null;
    /** Whether a booking note exists. The note itself is not sent — see above. */
    readonly hasNote: boolean;
  };

  readonly session: {
    readonly therapistId: string;
    readonly date: string;
    readonly time: string;
    readonly utcDateTime: string | null;
    readonly sessionType: string;
    readonly sessionMode: string | null;
  };

  readonly payment: {
    readonly amountRupees: number | null;
    readonly currency: string | null;
    readonly razorpayOrderId: string | null;
    readonly razorpayPaymentId: string | null;
    readonly verifiedAtIso: string | null;
    /** A seeded/test payment. Refunds are never attempted against these. */
    readonly isMockPayment: boolean;
  };

  readonly refund: {
    readonly status: string | null;
    readonly id: string | null;
    /** Paise, as `RefundService` writes it. Converted for display, not here. */
    readonly amountPaise: number | null;
    readonly atIso: string | null;
  };

  readonly meeting: {
    readonly url: string | null;
    readonly calendarEventId: string | null;
    readonly calendarStatus: string | null;
    readonly calendarError: string | null;
    readonly calendarCreatedAtIso: string | null;
  };

  readonly notifications: {
    readonly emailStatus: string | null;
    readonly emailAttempts: number | null;
    readonly lastEmailError: string | null;
    readonly reminderStatus: string | null;
    readonly reminderSentAtIso: string | null;
    readonly reminderError: string | null;
  };

  readonly outcome: {
    readonly reason: string | null;
    readonly customNote: string | null;
    readonly declinedAtIso: string | null;
    readonly declinedBy: string | null;
    readonly noShowReason: string | null;
    readonly reviewRating: number | null;
    readonly reviewComment: string | null;
  };

  readonly reschedule: {
    readonly originalDate: string | null;
    readonly originalTime: string | null;
    readonly lastAtIso: string | null;
    readonly history: readonly AdminRescheduleRecord[];
  };

  readonly access: {
    /** A manage-booking link was issued. The token itself is never sent. */
    readonly hasManageToken: boolean;
    readonly manageTokenInvalidated: boolean;
    /** When an unpaid hold lapses. Past means the slot is no longer held. */
    readonly holdExpiresAtIso: string | null;
  };

  readonly createdAtIso: string | null;
  readonly updatedAtIso: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toRescheduleRecord(entry: unknown): AdminRescheduleRecord | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  return {
    previousDate: text(record.previousDate) ?? '',
    previousTime: text(record.previousTime) ?? '',
    newDate: text(record.newDate) ?? '',
    newTime: text(record.newTime) ?? '',
    atIso: isoOrNull(record.rescheduledAt),
    reason: text(record.reason),
  };
}

export function toAdminBookingDetail(booking: AdminBookingDetailSource): AdminBookingDetail {
  const paymentId = text(booking.razorpayPaymentId);
  const history = Array.isArray(booking.rescheduleHistory)
    ? booking.rescheduleHistory
        .map(toRescheduleRecord)
        .filter((record): record is AdminRescheduleRecord => record !== null)
    : [];

  return {
    id: booking.id,
    status: booking.status ?? 'pending',
    statusGroup: bookingStatusGroupFor(booking.status)?.id ?? null,
    paymentStatus: booking.paymentStatus ?? null,
    paymentGroup: paymentStatusGroupFor(booking.paymentStatus)?.id ?? null,

    client: {
      name: booking.name ?? '',
      email: booking.email ?? '',
      phone: booking.phone ?? '',
      userId: text(booking.userId),
      gender: text(booking.gender),
      age: finiteNumber(booking.age),
      hasNote: text(booking.message) !== null,
    },

    session: {
      therapistId: booking.therapistId ?? '',
      date: booking.date ?? '',
      time: booking.time ?? '',
      utcDateTime: text(booking.utcDateTime),
      sessionType: booking.sessionType ?? '',
      sessionMode: text(booking.sessionMode),
    },

    payment: {
      amountRupees: finiteNumber(booking.paymentAmount),
      currency: text(booking.paymentCurrency),
      razorpayOrderId: text(booking.razorpayOrderId),
      razorpayPaymentId: paymentId,
      verifiedAtIso: isoOrNull(booking.paymentVerifiedAt),
      isMockPayment: paymentId !== null && paymentId.startsWith('mock_'),
    },

    refund: {
      status: text(booking.refundStatus),
      id: text(booking.refundId),
      amountPaise: finiteNumber(booking.refundAmount),
      atIso: isoOrNull(booking.refundedAt),
    },

    meeting: {
      url: text(booking.meetingUrl),
      calendarEventId: text(booking.googleCalendarEventId),
      calendarStatus: text(booking.calendarStatus),
      calendarError: text(booking.calendarError),
      calendarCreatedAtIso: isoOrNull(booking.calendarCreatedAt),
    },

    notifications: {
      emailStatus: text(booking.emailStatus),
      emailAttempts: finiteNumber(booking.emailAttempts),
      lastEmailError: text(booking.lastEmailError),
      reminderStatus: text(booking.reminderStatus),
      reminderSentAtIso: isoOrNull(booking.reminderSentAt),
      reminderError: text(booking.reminderError),
    },

    outcome: {
      reason: text(booking.cancellationOrRejectionReason) ?? text(booking.declineReason),
      customNote: text(booking.declineCustomNote),
      declinedAtIso: isoOrNull(booking.declinedAt),
      declinedBy: text(booking.declinedBy),
      noShowReason: text(booking.noShowReason),
      reviewRating: finiteNumber(booking.reviewRating),
      reviewComment: text(booking.reviewComment),
    },

    reschedule: {
      originalDate: text(booking.originalDate),
      originalTime: text(booking.originalTime),
      lastAtIso: isoOrNull(booking.rescheduledAt),
      history,
    },

    access: {
      hasManageToken: text(booking.bookingToken) !== null,
      manageTokenInvalidated: booking.invalidToken === true,
      holdExpiresAtIso: isoOrNull(booking.holdExpiresAt),
    },

    createdAtIso: isoOrNull(booking.createdAt),
    updatedAtIso: isoOrNull(booking.updatedAt),
  };
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

/**
 * Where a history entry was found.
 *
 * Two collections record what happened to a booking and neither is complete on
 * its own, so both are read and merged:
 *
 *  - `booking` — the `bookings/{id}/audit_logs` subcollection: status changes,
 *    reschedules, payment-link sends.
 *  - `system` — the top-level `audit_logs` collection filtered by `bookingId`:
 *    slot holds and releases, payment success and failure, refund decisions.
 *
 * `AuditService.logEvent` is a third writer, but the exported `auditService`
 * instance is constructed with no repository, so those calls reach the
 * application log and nothing else. Nothing durable is missed by ignoring it.
 */
export type AdminTimelineSource = 'booking' | 'system';

export interface AdminTimelineEntry {
  readonly id: string;
  readonly atIso: string | null;
  /** The stored `action`/`eventType`, unmodified. Humanized for display only. */
  readonly kind: string;
  readonly details: string | null;
  readonly status: string | null;
  readonly reason: string | null;
  /** The uid recorded as responsible, when one was recorded. */
  readonly actor: string | null;
  readonly source: AdminTimelineSource;
}

export interface AdminTimelineDocument {
  readonly id: string;
  readonly data: Record<string, unknown>;
}

function normalizeEntry(
  doc: AdminTimelineDocument,
  source: AdminTimelineSource
): AdminTimelineEntry | null {
  const data = doc.data ?? {};
  const kind = text(data.action) ?? text(data.eventType);
  // An entry with no kind cannot be described, and inventing a label for it
  // would put a fabricated event in an audit trail.
  if (!kind) return null;

  return {
    id: doc.id,
    atIso: isoOrNull(data.timestamp),
    kind,
    details: text(data.details),
    status: text(data.status),
    reason: text(data.reason),
    actor: text(data.userId) ?? text(data.cancelledBy) ?? text(data.actorId),
    source,
  };
}

/**
 * Merges the two audit collections into one list, newest first.
 *
 * Entries whose timestamp is unreadable sort last rather than being dropped or
 * assigned a plausible-looking time — an audit trail that quietly reorders
 * itself is worse than one that admits an entry's time is unknown. Ties break on
 * id so the order is stable between requests.
 */
export function mergeAdminTimeline(
  bookingScoped: readonly AdminTimelineDocument[],
  systemScoped: readonly AdminTimelineDocument[]
): readonly AdminTimelineEntry[] {
  const entries = [
    ...bookingScoped.map((doc) => normalizeEntry(doc, 'booking')),
    ...systemScoped.map((doc) => normalizeEntry(doc, 'system')),
  ].filter((entry): entry is AdminTimelineEntry => entry !== null);

  return entries.sort((a, b) => {
    if (a.atIso === null && b.atIso === null) return a.id.localeCompare(b.id);
    if (a.atIso === null) return 1;
    if (b.atIso === null) return -1;
    if (a.atIso === b.atIso) return a.id.localeCompare(b.id);
    return b.atIso.localeCompare(a.atIso);
  });
}

/* ------------------------------------------------------------------ *
 * What may be done to this booking
 * ------------------------------------------------------------------ */

export type AdminBookingActionId = 'confirm' | 'cancel' | 'complete' | 'no_show' | 'reschedule';

export interface AdminBookingActionVerdict {
  readonly action: AdminBookingActionId;
  readonly allowed: boolean;
  /** Why not, in words an operator can act on. Empty when allowed. */
  readonly reason: string;
}

/**
 * Whether each action is available for a booking in this state, and why not
 * when it is not.
 *
 * Every rule here mirrors a server-side guard that runs again when the action is
 * submitted — `BookingStateMachine.canTransition`, the status checks in
 * `SessionLifecycleService`, and the explicit refusals in
 * `AdminConfirmBookingCommandHandler`, `CancelBookingCommandHandler` and
 * `RescheduleBookingCommandHandler`. This function decides what an operator is
 * *offered*; it decides nothing about what is *permitted*. Deleting it entirely
 * would change the UI and change no security property.
 *
 * The transition rules are read from `BookingStateMachine` rather than restated,
 * so the two cannot drift apart.
 */
export function permittedAdminActions(
  status: string,
  paymentStatus: string | null
): readonly AdminBookingActionVerdict[] {
  const normalized = BookingStateMachine.normalizeStatus(status);
  const settled = normalized === 'cancelled' || normalized === 'rejected';
  const finished = normalized === 'completed' || normalized === 'no_show';

  const verdicts: AdminBookingActionVerdict[] = [];

  const canTransition = (to: BookingStatus) => BookingStateMachine.canTransition(normalized, to);

  verdicts.push({
    action: 'confirm',
    allowed: !settled && !finished && canTransition('confirmed'),
    reason: settled
      ? 'This booking was cancelled or declined. Confirming it is refused by the server.'
      : finished
        ? 'This session has already concluded.'
        : normalized === 'confirmed'
          ? 'Already confirmed.'
          : canTransition('confirmed')
            ? ''
            : `A booking in '${normalized}' cannot move straight to confirmed.`,
  });

  verdicts.push({
    action: 'cancel',
    allowed: !finished && !settled,
    reason: finished
      ? 'A completed or no-show session cannot be cancelled.'
      : settled
        ? 'Already cancelled or declined.'
        : '',
  });

  const isLive = normalized === 'confirmed' || normalized === 'rescheduled';

  verdicts.push({
    action: 'complete',
    allowed: isLive,
    reason: isLive
      ? ''
      : normalized === 'completed'
        ? 'Already completed.'
        : `Only a confirmed session can be completed. This one is '${normalized}'.`,
  });

  verdicts.push({
    action: 'no_show',
    allowed: isLive,
    reason: isLive
      ? ''
      : normalized === 'no_show'
        ? 'Already marked as a no-show.'
        : `Only a confirmed session can be marked a no-show. This one is '${normalized}'.`,
  });

  verdicts.push({
    action: 'reschedule',
    allowed: !settled && !finished,
    reason: settled
      ? 'A cancelled or declined booking cannot be rescheduled.'
      : finished
        ? 'A concluded session cannot be rescheduled.'
        : '',
  });

  // Payment state does not gate any of these. An admin confirming an unpaid
  // booking is a real operation (payment taken outside Razorpay), and the
  // command allows it; the screen says so rather than hiding the button.
  void paymentStatus;

  return verdicts;
}
