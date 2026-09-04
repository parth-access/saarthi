import { describe, it, expect } from 'vitest';
import { SlotAlreadyBookedError } from '@/domains/booking/errors/SlotAlreadyBookedError';
import { InvalidBookingTransitionError } from '@/domains/booking/errors/InvalidBookingTransitionError';
import {
  GENERIC_ACTION_ERROR,
  adminBookingActionSchema,
  classifyActionError,
  describeCancel,
  describeConfirm,
  describeLifecycle,
  describeReschedule,
} from './adminBookingAction';

/**
 * What an operator is allowed to ask for, told afterwards, and told when it
 * fails.
 *
 * The classification block is the reason this file matters most. It asserts
 * against the *literal strings the command handlers throw today*, copied from
 * their source. If someone rewords a `throw` — a reasonable thing to do — a test
 * here goes red. Without that, the reword would silently downgrade a precise 409
 * to a generic 500 and an operator would be told "the reason was not one this
 * console recognises" for an ordinary double-click.
 */

describe('request schema', () => {
  it('accepts each of the five actions in its minimal valid form', () => {
    const valid: unknown[] = [
      { action: 'confirm' },
      { action: 'cancel', reason: 'Therapist unwell' },
      { action: 'complete' },
      { action: 'no_show' },
      { action: 'reschedule', date: '2026-09-20', time: '09:00' },
    ];
    for (const body of valid) {
      expect(adminBookingActionSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    }
  });

  it('rejects an action it does not implement', () => {
    // A discriminated union, so an unknown verb cannot fall through to a branch
    // that happens to have compatible fields.
    for (const action of ['refund', 'delete', 'confirm_and_email', '']) {
      expect(adminBookingActionSchema.safeParse({ action }).success).toBe(false);
    }
  });

  describe('cancellation reason', () => {
    it('is required, because the client is shown it', () => {
      expect(adminBookingActionSchema.safeParse({ action: 'cancel' }).success).toBe(false);
    });

    it('is not satisfied by whitespace', () => {
      // Trim happens before the length check, so '   ' is an empty reason and the
      // email would read "Your session was cancelled:" followed by nothing.
      const parsed = adminBookingActionSchema.safeParse({ action: 'cancel', reason: '    ' });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toContain('the client sees it');
      }
    });

    it('arrives trimmed', () => {
      const parsed = adminBookingActionSchema.parse({
        action: 'cancel',
        reason: '  Therapist unwell  ',
      });
      expect(parsed).toMatchObject({ reason: 'Therapist unwell' });
    });

    it('prunes a whitespace-only note to absent rather than empty', () => {
      const parsed = adminBookingActionSchema.parse({
        action: 'cancel',
        reason: 'Therapist unwell',
        note: '   ',
      });
      // Not `''`: the note reaches the cancellation email and the outbox payload.
      expect(parsed).toMatchObject({ note: undefined });
    });

    it('is optional for a no-show, which has a domain default', () => {
      expect(adminBookingActionSchema.safeParse({ action: 'no_show' }).success).toBe(true);
      // But a supplied one is still held to the same bar rather than reaching the
      // booking as a stray character.
      expect(adminBookingActionSchema.safeParse({ action: 'no_show', reason: 'x' }).success).toBe(false);
    });
  });

  describe('reschedule slot', () => {
    it('requires a zero-padded 24-hour time', () => {
      // `locked_slots` document ids are `${therapistId}_${date}_${time}`, so
      // '9:00' and '09:00' would pin two different documents for one instant.
      // Normalising here would hide that; rejecting makes the client send one form.
      for (const time of ['9:00', '09:0', '9:0', '24:00', '09:60', '09:00:00', '9am', '']) {
        expect(
          adminBookingActionSchema.safeParse({ action: 'reschedule', date: '2026-09-20', time }).success,
          time
        ).toBe(false);
      }
      for (const time of ['00:00', '09:00', '13:30', '23:59']) {
        expect(
          adminBookingActionSchema.safeParse({ action: 'reschedule', date: '2026-09-20', time }).success,
          time
        ).toBe(true);
      }
    });

    it('requires an ISO date', () => {
      for (const date of ['2026-9-20', '20-09-2026', '2026/09/20', '', '2026-09-20T00:00:00Z']) {
        expect(
          adminBookingActionSchema.safeParse({ action: 'reschedule', date, time: '09:00' }).success,
          date
        ).toBe(false);
      }
    });

    it('leaves calendar validity to the domain', () => {
      // '2026-02-30' is well-formed and impossible. The handler resolves it via
      // `slotStartEpochMs` and reports 'Invalid reschedule date/time format.';
      // duplicating that arithmetic here would give two sources of truth for
      // which days exist.
      expect(
        adminBookingActionSchema.safeParse({ action: 'reschedule', date: '2026-02-30', time: '09:00' }).success
      ).toBe(true);
    });
  });
});

describe('describing what happened', () => {
  describe('confirm', () => {
    it('reports a no-op as a no-op', () => {
      const summary = describeConfirm({ success: true, alreadyConfirmed: true });
      expect(summary.changed).toBe(false);
      expect(summary.summary).toContain('already confirmed');
      // The operator's real question after a double-click: did the client get a
      // second email?
      expect(summary.details.join(' ')).toContain('No email was sent');
    });

    it('does not promise the confirmation email came from this action', () => {
      const summary = describeConfirm({ success: true });
      expect(summary.changed).toBe(true);
      // The email carrying the Meet link is sent by the calendar sync, not by the
      // confirm command — see the calendar-owned confirmation email. Claiming
      // otherwise would send an operator to the wrong place when it fails to
      // arrive.
      expect(summary.details.join(' ')).toContain('calendar sync');
    });
  });

  describe('cancel', () => {
    const base = { success: true, outcome: 'cancelled' as const, alreadySettled: false };

    it('reports an already-settled booking as unchanged and refund-free', () => {
      const summary = describeCancel({ ...base, refundPercent: 100, refundEnqueued: false, alreadySettled: true });
      expect(summary.changed).toBe(false);
      expect(summary.details.join(' ')).toContain('No refund was enqueued');
    });

    it('calls a decline a decline', () => {
      // 'rejected' is what the domain does to a booking that was never confirmed.
      // Telling an operator it was "cancelled" would make the audit trail read as
      // if it disagreed with the console.
      const summary = describeCancel({ ...base, outcome: 'rejected', refundPercent: 0, refundEnqueued: false });
      expect(summary.summary).toContain('declined');
    });

    it('says a queued refund is queued, not paid', () => {
      const summary = describeCancel({ ...base, refundPercent: 100, refundEnqueued: true });
      const text = summary.details.join(' ');
      expect(text).toContain('100%');
      expect(text).toContain('queued, not completed');
    });

    it('separates the policy percent from whether a refund exists', () => {
      // The trap this endpoint is most likely to mislead on: a 100% policy on an
      // unpaid booking enqueues nothing, and an operator who reads "100%" as
      // "refunded" tells the client something false.
      const summary = describeCancel({ ...base, refundPercent: 100, refundEnqueued: false });
      const text = summary.details.join(' ');
      expect(text).toContain('no refund was enqueued');
      expect(text).toContain('no captured Razorpay payment');
    });

    it('states plainly when the policy allows nothing', () => {
      const summary = describeCancel({ ...base, refundPercent: 0, refundEnqueued: false });
      expect(summary.details.join(' ')).toContain('No refund was enqueued');
    });

    it('always says the slot was released', () => {
      // The next question after any cancellation is whether the time is bookable
      // again, and the answer is not visible anywhere else on the screen.
      const summary = describeCancel({ ...base, refundPercent: 50, refundEnqueued: true });
      expect(summary.details.join(' ')).toContain('bookable again');
    });
  });

  describe('complete / no-show', () => {
    it('reports the idempotent path as unchanged', () => {
      const summary = describeLifecycle('complete', {
        success: true,
        alreadyInTargetStatus: true,
        previousStatus: 'completed',
        newStatus: 'completed',
      });
      expect(summary.changed).toBe(false);
      expect(summary.summary).toContain('already marked completed');
      // Even though the handler returned both statuses on this path, printing the
      // transition would describe a write that did not happen.
      expect(summary.details).toEqual([]);
    });

    it('records the status it overwrote', () => {
      const summary = describeLifecycle('no_show', {
        success: true,
        previousStatus: 'rescheduled',
        newStatus: 'no_show',
      });
      expect(summary.changed).toBe(true);
      expect(summary.summary).toContain('a no-show');
      expect(summary.details.join(' ')).toContain("from 'rescheduled' to 'no_show'");
    });

    it('does not invent a previous status the handler did not return', () => {
      // 'confirmed' would be a safe-looking guess and wrong for a booking that was
      // in 'rescheduled'. Silence is the honest output.
      const summary = describeLifecycle('complete', { success: true });
      expect(summary.details).toEqual([]);
    });
  });

  describe('reschedule', () => {
    it('states both slots and that the Meet link survived', () => {
      const summary = describeReschedule({
        date: '2026-09-20',
        time: '14:30',
        previousDate: '2026-09-18',
        previousTime: '09:00',
      });
      expect(summary.changed).toBe(true);
      expect(summary.summary).toContain('2026-09-20 at 14:30 IST');
      const text = summary.details.join(' ');
      expect(text).toContain('2026-09-18 at 09:00 IST');
      // Operators expect a moved session to mean a new link, and tell clients so.
      // The patch preserves it — but the no-event fallback does not, and both are
      // stated rather than the reassuring half.
      expect(text).toContain('existing Meet link is preserved');
      expect(text).toContain('its link is new');
    });
  });
});

/**
 * Every string below is copied from a live `throw`. The comment names the source
 * so the pairing can be re-verified rather than trusted.
 */
describe('classifying a failure', () => {
  const CASES: readonly { throws: string; source: string; status: number; expect: string }[] = [
    // RescheduleBookingCommand.ts + AdminConfirmBookingCommand.ts + sessionLifecycleService.ts
    { throws: 'Booking not found', source: 'all four handlers', status: 404, expect: 'no longer exists' },

    // RescheduleBookingCommand.ts readPlan / sessionLifecycleService.ts
    { throws: 'Unauthorized to modify this booking', source: 'reschedule, therapist branch', status: 403, expect: 'refused this operation' },
    { throws: 'Unauthorized to modify this session', source: 'lifecycle, therapist branch', status: 403, expect: 'refused this operation' },
    { throws: 'Unauthorized: Reschedule token has been invalidated.', source: 'reschedule, token flow', status: 403, expect: 'refused this operation' },
    { throws: 'Unauthorized: Client user ownership mismatch', source: 'reschedule, client branch', status: 403, expect: 'refused this operation' },

    // AdminConfirmBookingCommand.ts
    { throws: 'Cannot confirm a cancelled or rejected booking', source: 'admin confirm', status: 409, expect: 'already been cancelled or declined' },

    // CancelBookingCommand.ts
    { throws: 'Cannot cancel or decline a completed or no-show booking', source: 'cancel', status: 409, expect: 'already concluded' },

    // RescheduleBookingCommand.ts readPlan, in source order
    { throws: 'Cannot reschedule a completed or no-show session.', source: 'reschedule', status: 409, expect: 'already concluded' },
    { throws: 'Cannot reschedule a cancelled or rejected booking.', source: 'reschedule', status: 409, expect: 'already been cancelled or declined' },
    { throws: 'Cannot reschedule to the current session time. Please choose a different slot.', source: 'reschedule', status: 400, expect: 'already occupies' },
    { throws: 'Invalid reschedule date/time format.', source: 'reschedule, impossible day', status: 400, expect: 'not in a format' },
    { throws: 'Cannot reschedule to a past date/time.', source: 'reschedule', status: 400, expect: 'already passed in IST' },
    { throws: 'Cannot reschedule further than 14 days in advance.', source: 'reschedule, booking window', status: 400, expect: 'beyond the booking window' },
    { throws: "The selected slot is outside the therapist's scheduled hours or overrides.", source: 'reschedule, availability', status: 409, expect: 'configured hours' },

    // SlotReservationService.ts
    { throws: 'This new slot is already booked.', source: 'slot swap', status: 409, expect: 'no longer free' },
    { throws: 'This new slot is unavailable.', source: 'slot swap', status: 409, expect: 'no longer free' },

    // Booking.ts entity guard (defence in depth behind the handler's own check)
    { throws: 'Cannot reschedule a cancelled booking', source: 'Booking.reschedule', status: 409, expect: 'already been cancelled or declined' },
  ];

  for (const c of CASES) {
    it(`maps ${JSON.stringify(c.throws)} (${c.source})`, () => {
      const classified = classifyActionError(new Error(c.throws));
      expect(classified.status).toBe(c.status);
      expect(classified.message.toLowerCase()).toContain(c.expect.toLowerCase());
      expect(classified.generic).toBe(false);
    });
  }

  describe('the pair that must not be confused', () => {
    // Both contain the substring 'completed', which is why order in the table is
    // load-bearing. Reporting "this session has already concluded" for a pending
    // booking would send an operator looking for a completion that never happened.
    it('reads a pending booking as not-confirmed, not as already-concluded', () => {
      const classified = classifyActionError(
        new Error("Cannot complete booking with status 'pending'. Only confirmed sessions can be completed.")
      );
      expect(classified.status).toBe(409);
      expect(classified.message).toContain('Only a confirmed session');
      expect(classified.message).not.toContain('already concluded');
    });

    it('reads the same refusal from the no-show path the same way', () => {
      const classified = classifyActionError(
        new Error(
          "Cannot mark session with status 'cancelled' as no-show. Only confirmed sessions can be marked no-show."
        )
      );
      expect(classified.status).toBe(409);
      expect(classified.message).toContain('Only a confirmed session');
    });
  });

  describe('typed domain errors', () => {
    it('classifies by code rather than by message', () => {
      const classified = classifyActionError(new SlotAlreadyBookedError());
      expect(classified.status).toBe(409);
      expect(classified.generic).toBe(false);
    });

    it('reports a transition refusal as a state conflict and never echoes the booking id', () => {
      // The domain error's message embeds the booking id. It carries a 400; this
      // console answers 409 because the request was fine and the state was not.
      const err = new InvalidBookingTransitionError(
        "Cannot transition booking bk_20260903_ABCD1234 from status 'cancelled' to 'completed'"
      );
      const classified = classifyActionError(err);
      expect(classified.status).toBe(409);
      expect(classified.message).not.toContain('bk_20260903_ABCD1234');
      expect(classified.message).toContain('Reload');
    });
  });

  describe('anything unrecognised', () => {
    it('is a generic 500 that keeps infrastructure out of the browser', () => {
      const firestore = new Error(
        '9 FAILED_PRECONDITION: The query requires an index. You can create it here: ' +
          'https://console.firebase.google.com/v1/r/project/saarthi-prod/firestore/indexes?create_composite=Ck'
      );
      const classified = classifyActionError(firestore);
      expect(classified.status).toBe(500);
      expect(classified.generic).toBe(true);
      expect(classified.message).toBe(GENERIC_ACTION_ERROR);
      expect(classified.message).not.toContain('saarthi-prod');
      expect(classified.message).not.toContain('console.firebase');
    });

    it('covers the uninitialised-database messages both service layers throw', () => {
      for (const raw of ['Firestore adminDb is not initialized.', 'Database is not initialized']) {
        const classified = classifyActionError(new Error(raw));
        expect(classified.status, raw).toBe(500);
        expect(classified.generic, raw).toBe(true);
      }
    });

    it('survives a thrown non-Error', () => {
      for (const thrown of [undefined, null, 42, {}, [], 'a bare string']) {
        const classified = classifyActionError(thrown);
        expect(classified.status).toBe(500);
        expect(classified.message).toBe(GENERIC_ACTION_ERROR);
      }
    });

    it('states that nothing was changed, because that is what a caller needs to know', () => {
      // A generic failure is the one case where the operator cannot see what
      // happened. Leaving it ambiguous invites a retry that double-applies.
      expect(GENERIC_ACTION_ERROR).toContain('Nothing was changed');
    });
  });
});
