/**
 * The parts of the admin booking-action endpoint that decide meaning rather than
 * perform I/O: what a request may ask for, what the browser is told about a
 * result, and what the browser is told about a failure.
 *
 * It lives apart from the route for one reason: these are the three places where
 * a mistake is invisible in production.
 *
 *  - **The outcome copy.** Every command here has a no-op path — already
 *    confirmed, already cancelled, already completed — and reports it in the
 *    result rather than by throwing. A route that answered `{ success: true }`
 *    would be telling the truth and still misleading an operator into believing
 *    they had just cancelled a booking that was cancelled last Tuesday. So the
 *    summary is derived from the fields the handler actually returned, and the
 *    no-op paths say plainly that nothing changed.
 *
 *  - **The refund sentence.** `refundPercent` is what the cancellation policy
 *    decided; `refundEnqueued` is whether a refund row was actually written.
 *    They come apart routinely — an unpaid booking, a mock payment, a 0% late
 *    cancellation — and an operator who reads "100%" as "the client has been
 *    refunded" will tell a client something false. Both are always stated.
 *
 *  - **The error text.** The command handlers throw plain `Error`s whose messages
 *    are written for developers and, in the Firestore case, name the project and
 *    carry console URLs. Classification is therefore an *allowlist*: a recognised
 *    domain refusal maps to copy chosen for an operator, and anything unrecognised
 *    becomes a generic 500 whose detail stays in the server log. A pattern that
 *    stops matching degrades to "something went wrong" — never to a wrong 200,
 *    and never to a leak.
 *
 * On matching those refusals by message text: the handlers do not yet throw typed
 * errors, and giving them some is the transaction-hardening track's work, not the
 * dashboard's. The table below is the seam until then, and its tests assert
 * against the literal strings the handlers throw today, so rewording a `throw`
 * without updating this file fails the suite instead of failing an operator.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * What may be asked for
 * ------------------------------------------------------------------ */

/**
 * `YYYY-MM-DD` and zero-padded `HH:MM`, matching the booking schemas exactly.
 *
 * Padding is mandatory rather than normalised because the `locked_slots`
 * document id is `${therapistId}_${date}_${time}` — `9:00` and `09:00` would pin
 * two different documents for one instant.
 */
const IST_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IST_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A cancellation reason is required, and required to be more than whitespace.
 *
 * It is not decoration: it is written to the booking, to the audit trail, and to
 * the email the client receives. "Why was my session cancelled" is the first
 * question anyone asks afterwards, and an empty string makes that unanswerable.
 */
const reason = z
  .string()
  .trim()
  .min(3, 'Give a reason of at least 3 characters — the client sees it.')
  .max(500);

export const adminBookingActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm') }),
  z.object({
    action: z.literal('cancel'),
    reason,
    /**
     * Optional extra note, pruned to `undefined` when blank rather than passed on
     * as an empty string: it reaches the cancellation email and the outbox
     * payload, and this project never enables `ignoreUndefinedProperties`, so a
     * whitespace-only value must be absent rather than stored empty.
     */
    note: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((value) => (value ? value : undefined)),
  }),
  z.object({ action: z.literal('complete') }),
  z.object({
    action: z.literal('no_show'),
    reason: reason.optional(),
  }),
  z.object({
    action: z.literal('reschedule'),
    date: z.string().regex(IST_DATE, 'Date must be YYYY-MM-DD.'),
    time: z.string().regex(IST_TIME, 'Time must be zero-padded 24-hour HH:MM.'),
  }),
]);

export type AdminBookingActionRequest = z.infer<typeof adminBookingActionSchema>;
export type AdminBookingActionName = AdminBookingActionRequest['action'];

/* ------------------------------------------------------------------ *
 * What happened
 * ------------------------------------------------------------------ */

/**
 * The shapes the four handlers return, narrowed to the fields this endpoint
 * reports. Structural on purpose: the route passes the handler's own result
 * through, so nothing can be summarised that was not actually returned.
 */
export interface ConfirmOutcome {
  readonly success: boolean;
  readonly alreadyConfirmed?: boolean;
}

export interface CancelOutcome {
  readonly success: boolean;
  readonly outcome: 'cancelled' | 'rejected';
  readonly refundPercent: number;
  readonly refundEnqueued: boolean;
  readonly alreadySettled: boolean;
}

export interface LifecycleOutcome {
  readonly success: boolean;
  readonly previousStatus?: string;
  readonly newStatus?: string;
  readonly alreadyInTargetStatus?: boolean;
}

export interface RescheduleOutcome {
  readonly date: string;
  readonly time: string;
  readonly previousDate: string;
  readonly previousTime: string;
}

/**
 * What the operator is told, and whether anything actually changed.
 *
 * `changed: false` is the load-bearing field. It drives the neutral rather than
 * the success styling on screen, so a no-op cannot look like an operation.
 */
export interface ActionSummary {
  readonly changed: boolean;
  readonly summary: string;
  /** Extra lines, each a separate fact. Empty when there is nothing to add. */
  readonly details: readonly string[];
}

export function describeConfirm(result: ConfirmOutcome): ActionSummary {
  if (result.alreadyConfirmed) {
    return {
      changed: false,
      summary: 'This booking was already confirmed. Nothing was changed.',
      details: ['No email was sent and no calendar event was created.'],
    };
  }
  return {
    changed: true,
    summary: 'Booking confirmed.',
    details: [
      'The confirmation email carrying the Google Meet link is sent by the calendar sync, so it arrives once the meeting exists — check the Meeting and calendar card if it does not.',
      'A session reminder is scheduled for 30 minutes before the start time.',
    ],
  };
}

/**
 * Cancellation, including the two things about it an operator most often gets
 * wrong: a decline is not a cancellation, and a refund percent is not a refund.
 */
export function describeCancel(result: CancelOutcome): ActionSummary {
  if (result.alreadySettled) {
    return {
      changed: false,
      summary: 'This booking was already cancelled or declined. Nothing was changed.',
      details: ['No refund was enqueued and no email was sent.'],
    };
  }

  const verb = result.outcome === 'rejected' ? 'declined' : 'cancelled';
  const details: string[] = ['The slot has been released and is bookable again.'];

  if (result.refundEnqueued) {
    details.push(
      `A refund of ${result.refundPercent}% was enqueued. It is queued, not completed — the refund cron submits it to Razorpay, and the Refund card shows the outcome once it has.`
    );
  } else if (result.refundPercent > 0) {
    details.push(
      `The cancellation policy allows ${result.refundPercent}%, but no refund was enqueued — that happens when the booking has no captured Razorpay payment to refund.`
    );
  } else {
    details.push(
      'No refund was enqueued. Either the booking was never paid, or the policy allows nothing at this notice.'
    );
  }

  return { changed: true, summary: `Booking ${verb}.`, details };
}

export function describeLifecycle(
  action: 'complete' | 'no_show',
  result: LifecycleOutcome
): ActionSummary {
  const label = action === 'complete' ? 'completed' : 'a no-show';

  if (result.alreadyInTargetStatus) {
    return {
      changed: false,
      summary: `This session was already marked ${label}. Nothing was changed.`,
      details: [],
    };
  }

  const details: string[] = [];
  // Stated only when the handler returned it: an inferred "from confirmed" would
  // be a guess, and this line is the operator's record of what they overwrote.
  if (result.previousStatus && result.newStatus) {
    details.push(`Status moved from '${result.previousStatus}' to '${result.newStatus}'.`);
  }

  return { changed: true, summary: `Session marked ${label}.`, details };
}

export function describeReschedule(result: RescheduleOutcome): ActionSummary {
  return {
    changed: true,
    summary: `Session moved to ${result.date} at ${result.time} IST.`,
    details: [
      `It was ${result.previousDate} at ${result.previousTime} IST.`,
      'The old slot has been released and the new one pinned.',
      // `updateCalendarEvent` patches, which preserves the Meet link — but it
      // falls back to creating the event when none exists, and that mints a new
      // link. Both cases are stated because an operator who promises the client
      // "same link" and is wrong has caused a missed session.
      'The Google Calendar event is patched, so an existing Meet link is preserved. If no event had been created yet, one is created now and its link is new.',
    ],
  };
}

/* ------------------------------------------------------------------ *
 * What went wrong
 * ------------------------------------------------------------------ */

export interface ClassifiedActionError {
  readonly status: number;
  readonly message: string;
  /** True when the real error text must be kept out of the response. */
  readonly generic: boolean;
}

/** Shown whenever the cause is not a recognised domain refusal. */
export const GENERIC_ACTION_ERROR =
  'The server refused this operation and the reason was not one this console recognises. Nothing was changed. The details are in the server log.';

/**
 * Copy for the two domain errors that already carry a machine-readable code.
 *
 * Preferred over any text match, and matched on `code` rather than `message`
 * because both messages embed identifiers — `InvalidBookingTransitionError`
 * names the booking id — which is exactly the sort of internal detail that
 * should not be echoed to a browser.
 */
const CODED_REFUSALS: Record<string, { readonly status: number; readonly message: string }> = {
  SLOT_ALREADY_BOOKED: {
    status: 409,
    message:
      'That slot is already held by another confirmed booking. Reload this page and pick a different time.',
  },
  INVALID_BOOKING_TRANSITION: {
    // 409, not the 400 the domain error itself carries. The request was
    // well-formed; it is the booking's *current state* that refused it, which is
    // what an operator needs to be told — reload, something moved. The domain
    // error's own `statusCode` is left alone because other callers depend on it,
    // and re-pointing it is the transaction-hardening track's call, not this
    // console's.
    status: 409,
    message:
      'The booking is not in a state that allows this. Reload — its status has probably changed since this page loaded.',
  },
};

/**
 * Recognised refusals, matched against the messages the handlers throw today.
 *
 * Ordered, first match wins, so a narrower pattern precedes any broader one that
 * would also match the same sentence. Two orderings are load-bearing:
 *
 *  - `'only confirmed sessions'` before `'completed'`, because
 *    `Cannot complete booking with status 'pending'. Only confirmed sessions can
 *    be completed.` contains both, and the `'completed'` copy ("already
 *    concluded") would be the opposite of what happened.
 *  - `'not found'` last, since it is a fragment of many unrelated sentences.
 */
const REFUSALS: readonly {
  readonly match: readonly string[];
  readonly status: number;
  readonly message: string;
}[] = [
  {
    match: ['current session time'],
    status: 400,
    message: 'That is the slot this session already occupies. Choose a different date or time.',
  },
  {
    match: ['only confirmed sessions'],
    status: 409,
    message:
      'Only a confirmed session can be completed or marked a no-show, and this one is in another state. Reload to see which.',
  },
  {
    match: ['already booked', 'slot is unavailable', 'slot is not available'],
    status: 409,
    message:
      'That slot is no longer free — someone took it while this page was open. Reload the booking and pick another.',
  },
  {
    match: ['past date'],
    status: 400,
    message: 'That time has already passed in IST. Choose a future slot.',
  },
  {
    match: ['days in advance'],
    status: 400,
    message: 'That date is beyond the booking window. Choose a nearer date.',
  },
  {
    match: ['scheduled hours or overrides', 'therapist availability'],
    status: 409,
    message:
      "That time is outside this therapist's configured hours. The slot grid only offers times they actually work — reload it rather than typing a time.",
  },
  {
    match: ['date/time format'],
    status: 400,
    message: 'The date or time was not in a format the server accepts.',
  },
  {
    // `'a cancelled booking'` / `'a rejected booking'` catch `Booking.reschedule`'s
    // own guard, which phrases the same refusal differently from the command
    // handler's. Unreachable through the handler today — it checks first — but the
    // entity guard is the defence-in-depth layer and should not degrade to a 500.
    match: ['cancelled or rejected', 'cancelled or declined', 'a cancelled booking', 'a rejected booking'],
    status: 409,
    message:
      'This booking has already been cancelled or declined, so it cannot be changed. Reload to see its current state.',
  },
  {
    match: ['completed or no-show', 'completed'],
    status: 409,
    message:
      'This session has already concluded, so it cannot be changed. Reload to see its current state.',
  },
  {
    match: ['unauthorized'],
    status: 403,
    message: 'The server refused this operation for this account.',
  },
  {
    match: ['not found'],
    status: 404,
    message: 'This booking no longer exists.',
  },
];

/** `AppError` without importing it: only these two fields are read. */
function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/**
 * Maps a thrown error to a status and operator-facing copy.
 *
 * Anything unrecognised is a generic 500 — including the Firestore and Razorpay
 * failures whose messages name infrastructure. `generic: true` marks those so the
 * route logs the real cause.
 */
export function classifyActionError(error: unknown): ClassifiedActionError {
  const code = codeOf(error);
  if (code && code in CODED_REFUSALS) {
    const coded = CODED_REFUSALS[code];
    return { status: coded.status, message: coded.message, generic: false };
  }

  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (raw) {
    const haystack = raw.toLowerCase();
    for (const refusal of REFUSALS) {
      if (refusal.match.some((needle) => haystack.includes(needle))) {
        return { status: refusal.status, message: refusal.message, generic: false };
      }
    }
  }

  return { status: 500, message: GENERIC_ACTION_ERROR, generic: true };
}
