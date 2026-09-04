/**
 * What an operator is told *before* they commit to a booking operation.
 *
 * Every line in this file is a claim about what the platform will actually do,
 * and each one was read off the code that does it rather than assumed:
 *
 *  - **Confirm** clears the temporary `locked_slots` hold and emits
 *    `BookingConfirmed`, which the calendar listener turns into a Google Calendar
 *    event and Meet link, and the reminder listener turns into a scheduled
 *    30-minute reminder. The confirmation email carrying the Meet link is sent by
 *    the calendar sync, not by the confirm command.
 *  - **Cancel** splits in two. A `pending` / `pending_approval` /
 *    `awaiting_payment` booking is *declined* — `BookingRejected` — and the
 *    client is emailed. A paid or confirmed booking is *cancelled* —
 *    `BookingCancelled` — and **no Saarthi email is sent to the client at all**.
 *    That asymmetry is the single most important thing this dialog exists to say:
 *    an operator who assumes the platform told the client is wrong half the time.
 *  - **Complete** and **no-show** emit events that only the timeline and audit
 *    listeners consume. No email, no refund, no slot change.
 *  - **Reschedule** swaps the slot pins and patches the calendar event.
 *
 * The refund preview is the same `computeRefundPercent` the server calls, given
 * the same session start, so it is a real prediction rather than a restatement of
 * the policy. It is labelled as re-decided on commit because it is: the server
 * recomputes it at transaction time, and a dialog left open across the 48-hour
 * boundary will have quoted the wrong figure.
 *
 * Nothing here authorizes anything. The verdicts that gate the buttons come from
 * `permittedAdminActions`, and every rule behind them is enforced again inside
 * the command handlers' transactions.
 */
import type { AdminBookingActionId, AdminBookingDetail } from '@/domains/booking/queries/adminBookingDetail';
import { computeRefundPercent } from '@/domains/payment/RefundPolicy';
import { slotStartEpochMs } from '@/shared/scheduling/slots';

/**
 * The same five ids `permittedAdminActions` returns verdicts for, re-exported
 * rather than redeclared: a sixth action added there must not silently be an
 * action this file has no copy for.
 */
export type BookingActionId = AdminBookingActionId;

/**
 * Reading order on the action bar: the two that move a booking forward, then the
 * two that close it out, then the one that ends it. Cancel is last because it is
 * the only irreversible one, and putting it beside "Confirm" invites the mis-click
 * that cannot be taken back.
 */
export const ACTION_ORDER: readonly BookingActionId[] = [
  'confirm',
  'reschedule',
  'complete',
  'no_show',
  'cancel',
];

/** Verbs an operator recognises, for the ids the query layer uses. */
export const ACTION_LABELS: Record<BookingActionId, string> = {
  confirm: 'Confirm this booking',
  cancel: 'Cancel this booking',
  complete: 'Mark the session completed',
  no_show: 'Mark the client a no-show',
  reschedule: 'Reschedule the session',
};

/** Short enough for a button. */
export const ACTION_BUTTONS: Record<BookingActionId, string> = {
  confirm: 'Confirm',
  cancel: 'Cancel booking',
  complete: 'Mark completed',
  no_show: 'Mark no-show',
  reschedule: 'Reschedule',
};

/** `danger` is reserved for the one action that cannot be undone. */
export const ACTION_TONE: Record<BookingActionId, 'primary' | 'danger' | 'neutral'> = {
  confirm: 'primary',
  reschedule: 'neutral',
  complete: 'neutral',
  no_show: 'neutral',
  cancel: 'danger',
};

/**
 * The booking fields that change what an action will do, and nothing else.
 *
 * Kept to primitives so this module has no opinion about the projection's shape
 * and can be exercised without one.
 */
export interface BookingActionFacts {
  readonly status: string;
  readonly paymentStatus: string | null;
  readonly razorpayPaymentId: string | null;
  readonly isMockPayment: boolean;
  /** IST calendar date, `YYYY-MM-DD`. */
  readonly date: string;
  /** Zero-padded IST start time, `HH:MM`. */
  readonly time: string;
  /** The instant stored at booking time, when one was stored. */
  readonly utcDateTimeIso: string | null;
  readonly hasMeetingLink: boolean;
}

/**
 * Reads the facts off the detail projection.
 *
 * A function rather than an inline object in the component so the field mapping is
 * covered by tests: picking `booking.paymentStatus` where the refund gate reads
 * `booking.payment.razorpayPaymentId` is the kind of mistake that produces a
 * confident, wrong refund figure with nothing on screen to contradict it.
 */
export function actionFactsFrom(booking: AdminBookingDetail): BookingActionFacts {
  return {
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    razorpayPaymentId: booking.payment.razorpayPaymentId,
    isMockPayment: booking.payment.isMockPayment,
    date: booking.session.date,
    time: booking.session.time,
    utcDateTimeIso: booking.session.utcDateTime,
    hasMeetingLink: booking.meeting.url !== null,
  };
}

/**
 * The session start, resolved the way the cancel command resolves it: the stored
 * UTC instant first, the IST date and time as the fallback. Matching it matters —
 * a different answer here would quote a refund percent the server disagrees with.
 */
export function sessionStartMs(facts: BookingActionFacts): number | null {
  if (facts.utcDateTimeIso) {
    const parsed = Date.parse(facts.utcDateTimeIso);
    if (Number.isFinite(parsed)) return parsed;
  }
  return slotStartEpochMs(facts.date, facts.time);
}

/** Statuses the domain declines rather than cancels. Copied from `CancelBookingCommand`. */
const DECLINE_STATUSES = new Set(['pending', 'pending_approval', 'awaiting_payment']);

/**
 * The rule `RescheduleBookingCommand` uses to decide whether a moved booking gets a
 * fresh 10-minute payment hold: `status === 'confirmed' || paymentStatus === 'paid'`.
 *
 * Both halves matter. Keying on payment alone would promise a restarted hold for a
 * confirmed-but-unpaid booking — an admin confirming a session paid for outside
 * Razorpay — which the command does not do.
 */
function holdsWithoutPayment(facts: BookingActionFacts): boolean {
  return facts.status === 'confirmed' || facts.paymentStatus === 'paid';
}

export interface CancelPreview {
  /** Which of the two the domain will do, decided by status alone. */
  readonly branch: 'decline' | 'cancel';
  /** Whether the platform emails the client. True only on the decline branch. */
  readonly emailsClient: boolean;
  /** The percent the policy allows right now, or null when no refund can apply. */
  readonly refundPercent: number | null;
  /** Why no refund can apply, in a sentence. Null when one can. */
  readonly refundBlockedBecause: string | null;
}

/**
 * What cancelling *now* would do, from the booking's own fields.
 *
 * A prediction, and treated as one: the server re-decides both the branch and the
 * percent inside its transaction. The value of computing it here is that an
 * operator can see "50%" before they commit rather than after, which is when the
 * client asks.
 */
export function previewCancel(facts: BookingActionFacts, nowMs: number): CancelPreview {
  const branch = DECLINE_STATUSES.has(facts.status) ? 'decline' : 'cancel';

  if (branch === 'decline') {
    return {
      branch,
      emailsClient: true,
      refundPercent: null,
      refundBlockedBecause:
        'A booking at this stage has not been paid for, so there is nothing to refund.',
    };
  }

  if (facts.paymentStatus !== 'paid') {
    return {
      branch,
      emailsClient: false,
      refundPercent: null,
      refundBlockedBecause: 'This booking is not marked paid, so there is nothing to refund.',
    };
  }

  if (!facts.razorpayPaymentId) {
    return {
      branch,
      emailsClient: false,
      refundPercent: null,
      refundBlockedBecause:
        'No Razorpay payment id is stored against this booking, so no capture can be refunded.',
    };
  }

  if (facts.isMockPayment) {
    return {
      branch,
      emailsClient: false,
      refundPercent: null,
      refundBlockedBecause:
        'This is a seeded test payment. No real capture exists, so no refund can be issued.',
    };
  }

  const startMs = sessionStartMs(facts);
  if (startMs === null) {
    // The server fails safe to 0% on an unresolvable start. Saying "0%" here would
    // read as a policy decision; this is a data problem, and it is worth naming.
    return {
      branch,
      emailsClient: false,
      refundPercent: 0,
      refundBlockedBecause:
        "This booking's session start cannot be read from its stored fields, and the refund policy fails safe to 0% when that happens.",
    };
  }

  return {
    branch,
    emailsClient: false,
    refundPercent: computeRefundPercent(startMs, nowMs),
    refundBlockedBecause: null,
  };
}

export interface ActionConsequences {
  readonly title: string;
  readonly confirmLabel: string;
  readonly tone: 'primary' | 'danger';
  /** One sentence per consequence, in the order they matter to the operator. */
  readonly lines: readonly string[];
  /** Drives the extra warning line. True only where nothing can put it back. */
  readonly irreversible: boolean;
}

/**
 * The consequences of one action on this particular booking.
 *
 * Written as statements of fact rather than warnings. "No email is sent to the
 * client" is more useful than "are you sure?", because the operator's next move
 * depends on it.
 */
export function consequencesFor(
  action: BookingActionId,
  facts: BookingActionFacts,
  nowMs: number
): ActionConsequences {
  switch (action) {
    case 'confirm':
      return {
        title: 'Confirm this booking',
        confirmLabel: 'Confirm booking',
        tone: 'primary',
        lines: [
          'A Google Calendar event and a Google Meet link are created for the client and the therapist.',
          'The confirmation email carrying that Meet link is sent by the calendar sync, so it goes out once the meeting exists — not the instant you click.',
          'A reminder is scheduled for 30 minutes before the session start.',
          'The temporary slot hold is cleared. The confirmed booking is what keeps the time reserved from then on.',
        ],
        irreversible: false,
      };

    case 'reschedule':
      return {
        title: 'Reschedule this session',
        confirmLabel: 'Move the session',
        tone: 'primary',
        lines: [
          'The old slot is released and the new one is pinned, in one transaction.',
          facts.hasMeetingLink
            ? 'The existing Google Calendar event is patched, so the Meet link stays the same.'
            : 'No Google Calendar event exists yet, so one is created now — the client will get a link they have not seen before.',
          'The client and the therapist are emailed the new time by the calendar sync.',
          holdsWithoutPayment(facts)
            ? 'The booking is already paid or confirmed, so no new payment hold is placed.'
            : 'This booking is neither paid nor confirmed, so the 10-minute payment hold restarts from now.',
        ],
        irreversible: false,
      };

    case 'complete':
      return {
        title: 'Mark this session completed',
        confirmLabel: 'Mark completed',
        tone: 'primary',
        lines: [
          "This is what the client's dashboard and the therapist's records will show.",
          'No email is sent to anyone.',
          'No refund is enqueued and the payment is untouched.',
          'A completed session cannot then be cancelled or rescheduled.',
        ],
        irreversible: false,
      };

    case 'no_show':
      return {
        title: 'Mark the client a no-show',
        confirmLabel: 'Mark no-show',
        tone: 'primary',
        lines: [
          'The reason you give is stored on the booking and is visible to the therapist.',
          'No email is sent to the client.',
          'No refund is enqueued. If the client is owed money, that is a separate decision.',
          'A no-show session cannot then be cancelled or rescheduled.',
        ],
        irreversible: false,
      };

    case 'cancel': {
      const preview = previewCancel(facts, nowMs);
      const lines: string[] = [];

      if (preview.branch === 'decline') {
        lines.push(
          'This booking has not been paid for, so the platform will record it as declined rather than cancelled.',
          'The client is emailed that it was declined, and the reason and note you give below appear in that email.'
        );
      } else {
        lines.push(
          // The asymmetry this dialog exists for.
          'The platform does not email the client when a paid or confirmed booking is cancelled. If they should be told, you have to tell them.',
          'The reason you give is stored on the booking and shown in this console. It is not sent anywhere.'
        );
      }

      lines.push('The slot is released and becomes bookable again immediately.');
      lines.push('The Google Calendar event is cancelled and any pending reminder is skipped.');

      if (preview.refundBlockedBecause) {
        lines.push(preview.refundBlockedBecause);
      } else if (preview.refundPercent === 0) {
        lines.push(
          'No refund: the session starts in under 24 hours, and the cancellation policy allows nothing at that notice.'
        );
      } else {
        lines.push(
          `A ${preview.refundPercent}% refund will be enqueued — that is what the policy allows at this notice. The server re-decides the percent at the moment you confirm, so it changes if you leave this open across a cutoff.`,
          'Enqueued is not paid. The refund cron submits it to Razorpay, and the Refund card on this page shows the result once it has.'
        );
      }

      return {
        title: preview.branch === 'decline' ? 'Decline this booking' : 'Cancel this booking',
        confirmLabel: preview.branch === 'decline' ? 'Decline booking' : 'Cancel booking',
        tone: 'danger',
        lines,
        irreversible: true,
      };
    }
  }
}

/** Mirrors the endpoint's own `min(3)`, so the dialog refuses what the server would. */
export function reasonProblem(reason: string, required: boolean): string | null {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return required ? 'A reason is required.' : null;
  }
  if (trimmed.length < 3) return 'Give at least 3 characters.';
  if (trimmed.length > 500) return `That is ${trimmed.length} characters; the limit is 500.`;
  return null;
}

/** Whether the dialog's submit button can be pressed at all. */
export function canSubmit(
  action: BookingActionId,
  draft: { reason: string; slot: string | null }
): boolean {
  if (action === 'cancel') return reasonProblem(draft.reason, true) === null;
  if (action === 'no_show') return reasonProblem(draft.reason, false) === null;
  if (action === 'reschedule') return draft.slot !== null;
  return true;
}
