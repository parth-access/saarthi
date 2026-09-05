import { describe, expect, it } from 'vitest';
import {
  REFUND_RETRY_CONCERN_ATTEMPTS,
  REFUND_UNATTEMPTED_STALL_MINUTES,
  causeNeedsAPerson,
  classifyRefundCause,
  compareOldestRequestedFirst,
  compareRecentlyUpdatedFirst,
  describeRefundCause,
  describeRefundReason,
  estimateRefundPaise,
  refundAmountClaim,
  refundAnomalies,
  refundStanding,
  summariseRefundQueue,
  type AdminRefundRow,
} from './refundTriage';

/**
 * The refunds queue's honesty rules.
 *
 * This is the one screen in the console about money that has not arrived, so the
 * failures worth testing are the ones that would let somebody be forgotten or
 * paid twice:
 *
 *  - an unprocessed refund must never present a rupee figure as fact;
 *  - a failure that retrying cannot fix must never read as "retrying";
 *  - a status this build does not recognise must count as money owed;
 *  - a raw gateway or Firestore error must never survive classification.
 */

const NOW = Date.parse('2026-09-05T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

function row(overrides: Partial<AdminRefundRow> = {}): AdminRefundRow {
  return {
    id: 'refund_pay_ABC123',
    bookingId: 'bk_20260901_AAAA1111',
    razorpayPaymentId: 'pay_ABC123',
    razorpayOrderId: 'order_ABC123',
    status: 'PENDING',
    reason: 'cancellation',
    refundPercent: 50,
    attempts: 0,
    refundId: null,
    amountRefundedPaise: null,
    cause: null,
    requestedAtIso: minutesAgo(4),
    updatedAtIso: minutesAgo(4),
    booking: {
      clientName: 'Asha Menon',
      sessionDate: '2026-09-10',
      sessionTime: '10:15',
      status: 'cancelled',
      paymentStatus: 'paid',
      paymentAmountRupees: 1500,
      currency: 'INR',
      refundStatus: null,
    },
    ...overrides,
  };
}

describe('classifyRefundCause', () => {
  it('recognises the three messages RefundService composes', () => {
    expect(classifyRefundCause('Payment not found at gateway')).toEqual({
      kind: 'payment_unknown_at_gateway',
    });
    expect(classifyRefundCause('Payment not captured (status=authorized)')).toEqual({
      kind: 'payment_not_captured',
      gatewayStatus: 'authorized',
    });
    expect(classifyRefundCause('Computed refund amount is 0 paise (nothing to refund)')).toEqual({
      kind: 'nothing_to_refund',
    });
  });

  it('reduces anything else to `unclassified`, carrying none of the text', () => {
    const leak =
      '9 FAILED_PRECONDITION: The query requires an index. You can create it here: ' +
      'https://console.firebase.google.com/v1/r/project/saarthi-prod/firestore/indexes?create_composite=Ck';
    const cause = classifyRefundCause(leak);

    expect(cause).toEqual({ kind: 'unclassified' });
    // The whole point: no branch of the result can carry the original message.
    expect(JSON.stringify(cause)).not.toContain('saarthi-prod');
    expect(JSON.stringify(cause)).not.toContain('console.firebase.google.com');
  });

  it('does not accept a message that merely contains a known one', () => {
    expect(classifyRefundCause('Razorpay said: Payment not found at gateway (request id 7)')).toEqual(
      { kind: 'unclassified' }
    );
  });

  it('drops a gateway status that does not look like one', () => {
    expect(classifyRefundCause('Payment not captured (status=<script>alert(1)</script>)')).toEqual({
      kind: 'unclassified',
    });
  });

  it('separates "no failure recorded" from "failure we cannot read"', () => {
    expect(classifyRefundCause(null)).toBeNull();
    expect(classifyRefundCause(undefined)).toBeNull();
    expect(classifyRefundCause('   ')).toBeNull();
    expect(classifyRefundCause('something')).toEqual({ kind: 'unclassified' });
  });
});

describe('causeNeedsAPerson', () => {
  it('is true for every cause a retry cannot change', () => {
    expect(causeNeedsAPerson({ kind: 'payment_unknown_at_gateway' })).toBe(true);
    expect(causeNeedsAPerson({ kind: 'payment_not_captured', gatewayStatus: 'failed' })).toBe(true);
    expect(causeNeedsAPerson({ kind: 'nothing_to_refund' })).toBe(true);
  });

  it('is false when the cause is unknown, because the retry is the right first response', () => {
    expect(causeNeedsAPerson({ kind: 'unclassified' })).toBe(false);
    expect(causeNeedsAPerson(null)).toBe(false);
  });

  it('says out loud, for every permanent cause, that retrying will not help', () => {
    for (const cause of [
      { kind: 'payment_unknown_at_gateway' } as const,
      { kind: 'payment_not_captured', gatewayStatus: 'created' } as const,
      { kind: 'nothing_to_refund' } as const,
    ]) {
      expect(describeRefundCause(cause)).toContain('Retrying cannot change that.');
    }
  });
});

describe('refundStanding', () => {
  it('reads a fresh pending refund as queued, and says the job will pick it up', () => {
    const standing = refundStanding(row({ requestedAtIso: minutesAgo(4) }), NOW);
    expect(standing.kind).toBe('queued');
    expect(standing.outstanding).toBe(true);
    expect(standing.next).toContain('every five minutes');
  });

  it('escalates a pending refund that has never been attempted for four ticks', () => {
    const standing = refundStanding(
      row({ requestedAtIso: minutesAgo(REFUND_UNATTEMPTED_STALL_MINUTES) }),
      NOW
    );
    expect(standing.kind).toBe('overdue');
    expect(standing.tone).toBe('danger');
    expect(standing.outstanding).toBe(true);
  });

  it('labels the stalled reading as an inference, because there is no cron log', () => {
    const standing = refundStanding(row({ requestedAtIso: minutesAgo(240) }), NOW);
    expect(standing.kind).toBe('overdue');
    expect(standing.next).toContain('no cron run log');
    expect(standing.next).toContain('inference');
  });

  it('does not escalate one minute early', () => {
    const standing = refundStanding(
      row({ requestedAtIso: minutesAgo(REFUND_UNATTEMPTED_STALL_MINUTES - 1) }),
      NOW
    );
    expect(standing.kind).toBe('queued');
  });

  it('distinguishes a refund that will retry from one that cannot ever succeed', () => {
    const retrying = refundStanding(
      row({ status: 'FAILED', attempts: 1, cause: { kind: 'unclassified' } }),
      NOW
    );
    expect(retrying.kind).toBe('retrying');
    expect(retrying.next).toContain('try again');

    const blocked = refundStanding(
      row({
        status: 'FAILED',
        attempts: 1,
        cause: { kind: 'payment_not_captured', gatewayStatus: 'authorized' },
      }),
      NOW
    );
    expect(blocked.kind).toBe('blocked');
    expect(blocked.tone).toBe('danger');
    expect(blocked.next).toContain('needs a decision');
  });

  it('escalates a repeatedly failing refund even when the cause is unreadable', () => {
    const standing = refundStanding(
      row({
        status: 'FAILED',
        attempts: REFUND_RETRY_CONCERN_ATTEMPTS,
        cause: { kind: 'unclassified' },
      }),
      NOW
    );
    expect(standing.kind).toBe('retrying');
    expect(standing.tone).toBe('danger');
    expect(standing.label).toBe('Failing repeatedly');
  });

  it('counts a processed refund as no longer owed, and says nothing else will happen', () => {
    const standing = refundStanding(
      row({ status: 'PROCESSED', amountRefundedPaise: 75000, refundId: 'rfnd_1' }),
      NOW
    );
    expect(standing.kind).toBe('settled');
    expect(standing.outstanding).toBe(false);
    expect(standing.next).toContain('Nothing further will happen');
  });

  it('counts an unrecognised status as money still owed', () => {
    const standing = refundStanding(row({ status: 'SETTLING' }), NOW);
    expect(standing.kind).toBe('unrecognised');
    expect(standing.outstanding).toBe(true);
    expect(standing.detail).toContain('SETTLING');
    expect(standing.next).toContain('nothing will act on this');
  });

  it('states that the requested time is missing rather than inventing an age', () => {
    const standing = refundStanding(row({ requestedAtIso: null }), NOW);
    expect(standing.ageMinutes).toBeNull();
    expect(standing.detail).toContain('at an unrecorded time');
    // With no age, a pending refund cannot be called stalled.
    expect(standing.kind).toBe('queued');
  });

  it('never reports a negative age from a document written by a fast clock', () => {
    const standing = refundStanding(row({ requestedAtIso: minutesAgo(-5) }), NOW);
    expect(standing.ageMinutes).toBe(0);
  });
});

describe('refundAmountClaim', () => {
  it('uses the same arithmetic RefundService uses', () => {
    // floor(capturedPaise × percent / 100), with the booking's rupees as the base.
    expect(estimateRefundPaise(1500, 50)).toBe(75000);
    expect(estimateRefundPaise(1500, 100)).toBe(150000);
    expect(estimateRefundPaise(1499.5, 50)).toBe(74975);
  });

  it('reports a processed refund as a settled fact, in paise', () => {
    expect(refundAmountClaim(row({ status: 'PROCESSED', amountRefundedPaise: 75000 }))).toEqual({
      kind: 'settled',
      paise: 75000,
    });
  });

  it('reports an unprocessed refund as an estimate, naming its basis', () => {
    expect(refundAmountClaim(row())).toEqual({
      kind: 'estimated',
      paise: 75000,
      percent: 50,
      basisRupees: 1500,
    });
  });

  it('refuses a rupee figure when there is no amount to apply the percent to', () => {
    const noBooking = refundAmountClaim(row({ booking: null }));
    expect(noBooking).toEqual({ kind: 'percent_only', percent: 50 });

    const noAmount = refundAmountClaim(
      row({ booking: { ...row().booking!, paymentAmountRupees: null } })
    );
    expect(noAmount).toEqual({ kind: 'percent_only', percent: 50 });
  });

  it('does not estimate an amount for a refund marked settled', () => {
    // The dangerous case: a plausible number beside the word "settled" invites an
    // operator to reconcile against a figure Razorpay never returned.
    const claim = refundAmountClaim(row({ status: 'PROCESSED', amountRefundedPaise: null }));
    expect(claim).toEqual({ kind: 'unknown' });
  });

  it('gives up rather than guess when no usable percent is stored', () => {
    expect(refundAmountClaim(row({ refundPercent: 0 }))).toEqual({ kind: 'unknown' });
    expect(refundAmountClaim(row({ refundPercent: null }))).toEqual({ kind: 'unknown' });
  });

  it('prefers a gateway amount over an estimate when a partial write left one behind', () => {
    expect(refundAmountClaim(row({ status: 'FAILED', amountRefundedPaise: 60000 }))).toEqual({
      kind: 'settled',
      paise: 60000,
    });
  });
});

describe('refundAnomalies', () => {
  it('says nothing about a document whose fields agree', () => {
    expect(refundAnomalies(row())).toEqual([]);
    expect(
      refundAnomalies(row({ status: 'PROCESSED', amountRefundedPaise: 75000, refundId: 'rfnd_1' }))
    ).toEqual([]);
  });

  it('catches a pending refund that has somehow been attempted', () => {
    // `attempts` only increments in RefundService.fail(), which writes FAILED in the
    // same update, so this pair cannot come from the normal path.
    const notes = refundAnomalies(row({ attempts: 2 }));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('2 attempts');
    expect(notes[0]).toContain('disagree');
  });

  it('names the reconciliation case instead of reading it as a lost reference', () => {
    // RefundService marks a refund PROCESSED when Razorpay already reports the
    // payment fully refunded; nothing new was issued, so there is no id to store.
    const notes = refundAnomalies(
      row({ status: 'PROCESSED', amountRefundedPaise: 75000, refundId: null })
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('no new refund was issued');
  });

  it('flags a settled refund with nothing to reconcile against', () => {
    const notes = refundAnomalies(row({ status: 'PROCESSED', amountRefundedPaise: null }));
    expect(notes.join(' ')).toContain('no refunded amount was recorded');
  });

  it('flags a settled refund that returned nothing', () => {
    const notes = refundAnomalies(
      row({ status: 'PROCESSED', amountRefundedPaise: 0, refundId: 'rfnd_1' })
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('No money was returned');
  });

  it('names the booking it could not read', () => {
    const notes = refundAnomalies(row({ booking: null }));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('bk_20260901_AAAA1111');
  });

  it('flags a refund that names no booking at all', () => {
    expect(refundAnomalies(row({ bookingId: null, booking: null }))).toEqual([
      'This refund names no booking.',
    ]);
  });

  it('flags a missing percent, since the amount owed cannot be derived without it', () => {
    expect(refundAnomalies(row({ refundPercent: null })).join(' ')).toContain(
      'No usable refund percent'
    );
  });
});

describe('describeRefundReason', () => {
  it('states, for a double booking, that the client paid and has no session', () => {
    // ConfirmBookingCommand captured the payment, found the slot already confirmed
    // for somebody else, and threw — so there is no session to attend.
    const reading = describeRefundReason('double_booking');
    expect(reading.tone).toBe('danger');
    expect(reading.detail).toContain('The client paid and has no session.');
    expect(reading.detail).toContain('never confirmed');
  });

  it('says a cancellation percent was fixed when it was cancelled, not now', () => {
    const reading = describeRefundReason('cancellation');
    expect(reading.tone).toBe('info');
    expect(reading.detail).toContain('not recalculated later');
  });

  it('passes an unrecognised reason through rather than inventing a label for it', () => {
    const reading = describeRefundReason('goodwill');
    expect(reading.label).toBe('goodwill');
    expect(reading.tone).toBe('neutral');
    expect(reading.detail).toContain('not one this console knows about');
  });

  it('separates a reason it cannot read from no reason at all', () => {
    expect(describeRefundReason(null).label).toBe('No reason recorded');
    expect(describeRefundReason('   ').label).toBe('No reason recorded');
  });
});

describe('ordering', () => {
  const ids = (rows: readonly AdminRefundRow[]) => rows.map((candidate) => candidate.id);

  it('puts the longest-waiting refund first', () => {
    const rows = [
      row({ id: 'r_new', requestedAtIso: minutesAgo(5) }),
      row({ id: 'r_old', requestedAtIso: minutesAgo(500) }),
      row({ id: 'r_mid', requestedAtIso: minutesAgo(60) }),
    ];
    expect(ids([...rows].sort(compareOldestRequestedFirst))).toEqual(['r_old', 'r_mid', 'r_new']);
  });

  it('sorts an undated refund last instead of to the top of an urgency queue', () => {
    const rows = [
      row({ id: 'r_missing', requestedAtIso: null }),
      row({ id: 'r_unparseable', requestedAtIso: 'yesterday' }),
      row({ id: 'r_dated', requestedAtIso: minutesAgo(5) }),
    ];
    const sorted = ids([...rows].sort(compareOldestRequestedFirst));
    expect(sorted[0]).toBe('r_dated');
    expect(sorted.slice(1).sort()).toEqual(['r_missing', 'r_unparseable']);
  });

  it('breaks a tie on id, so one queue never renders in two different orders', () => {
    const at = minutesAgo(30);
    const rows = [row({ id: 'r_b', requestedAtIso: at }), row({ id: 'r_a', requestedAtIso: at })];
    expect(ids([...rows].sort(compareOldestRequestedFirst))).toEqual(['r_a', 'r_b']);

    const undated = [
      row({ id: 'r_d', requestedAtIso: null }),
      row({ id: 'r_c', requestedAtIso: null }),
    ];
    expect(ids([...undated].sort(compareOldestRequestedFirst))).toEqual(['r_c', 'r_d']);
  });

  it('reads settled refunds most-recently-touched first', () => {
    const rows = [
      row({ id: 'r_stale', updatedAtIso: minutesAgo(900) }),
      row({ id: 'r_fresh', updatedAtIso: minutesAgo(2) }),
      row({ id: 'r_unknown', updatedAtIso: null }),
    ];
    expect(ids([...rows].sort(compareRecentlyUpdatedFirst))).toEqual([
      'r_fresh',
      'r_stale',
      'r_unknown',
    ]);
  });
});

describe('summariseRefundQueue', () => {
  it('reports an empty queue as nothing owed, without inventing an age', () => {
    const summary = summariseRefundQueue([], NOW);
    expect(summary.total).toBe(0);
    expect(summary.outstanding).toBe(0);
    expect(summary.oldestOutstandingMinutes).toBeNull();
    expect(summary.estimatedOutstandingPaise).toBe(0);
    expect(summary.unpriced).toBe(0);
  });

  it('counts a status it does not recognise as money still owed', () => {
    const summary = summariseRefundQueue([row({ status: 'SETTLING' })], NOW);
    expect(summary.outstanding).toBe(1);
    expect(summary.byStanding.unrecognised).toBe(1);
  });

  it('leaves a settled refund out of both the money owed and the oldest age', () => {
    const summary = summariseRefundQueue(
      [
        row({
          id: 'r_done',
          status: 'PROCESSED',
          amountRefundedPaise: 150000,
          refundId: 'rfnd_1',
          requestedAtIso: minutesAgo(4000),
        }),
        row({ id: 'r_owed', requestedAtIso: minutesAgo(30) }),
      ],
      NOW
    );
    expect(summary.total).toBe(2);
    expect(summary.outstanding).toBe(1);
    expect(summary.estimatedOutstandingPaise).toBe(75000);
    expect(summary.oldestOutstandingMinutes).toBe(30);
  });

  it('counts an outstanding refund it cannot price rather than omitting it', () => {
    // A total that quietly dropped the rows it could not price would read as the
    // money owed while being less than it.
    const summary = summariseRefundQueue(
      [row({ id: 'r_priced' }), row({ id: 'r_unpriced', booking: null })],
      NOW
    );
    expect(summary.outstanding).toBe(2);
    expect(summary.estimatedOutstandingPaise).toBe(75000);
    expect(summary.unpriced).toBe(1);
  });

  it('counts the refunds a retry cannot fix apart from the ones it can', () => {
    const summary = summariseRefundQueue(
      [
        row({
          id: 'r_blocked',
          status: 'FAILED',
          attempts: 1,
          cause: { kind: 'nothing_to_refund' },
        }),
        row({ id: 'r_retry', status: 'FAILED', attempts: 1, cause: { kind: 'unclassified' } }),
      ],
      NOW
    );
    expect(summary.needsAPerson).toBe(1);
    expect(summary.byStanding.blocked).toBe(1);
    expect(summary.byStanding.retrying).toBe(1);
    expect(summary.outstanding).toBe(2);
  });
});
