import { describe, expect, it } from 'vitest';
import {
  ATTENTION_QUEUES,
  HOLD_EXPIRING_SOON_MINUTES,
  MACHINERY_CAVEAT,
  MACHINERY_STALL_MINUTES,
  attentionQueue,
  boundedCount,
  classifyHold,
  describeHold,
  formatBoundedCount,
  orderTodaySchedule,
  readMachinery,
  summariseAttention,
  type AttentionCounts,
  type AttentionQueueId,
  type BoundedCount,
  type OutboxObservation,
  type WaitingEvent,
} from './overviewTriage';
import { parseAdminBookingsView } from '@/components/admin/bookings/adminBookingsUrlState';
import { resolveAdminNavItem } from '@/components/admin/shell/navigation';
import { SESSION_DURATION_MINUTES } from '@/shared/constants';

/**
 * The overview's honesty rules.
 *
 * Nothing on that page is rendered by a test, so every claim it makes has to be
 * a claim this file can check. The ones that matter are not the arithmetic:
 *
 *  - a source that failed must never be reported as a zero;
 *  - a count that hit its scan limit must never be reported as a total;
 *  - a queue's link must land somewhere that can actually do the work;
 *  - a quiet queue must not be reported as proof the cron ran.
 */

const ALL_ZERO: AttentionCounts = {
  awaiting_approval: { ok: true, count: 0, atLeast: false },
  lapsed_holds: { ok: true, count: 0, atLeast: false },
  missing_meet_link: { ok: true, count: 0, atLeast: false },
  refunds_outstanding: { ok: true, count: 0, atLeast: false },
  events_abandoned: { ok: true, count: 0, atLeast: false },
  emails_failed: { ok: true, count: 0, atLeast: false },
};

function counts(overrides: Partial<Record<AttentionQueueId, BoundedCount>>): AttentionCounts {
  return { ...ALL_ZERO, ...overrides };
}

/* ------------------------------------------------------------------ *
 * Bounded counting
 * ------------------------------------------------------------------ */

describe('bounded counts', () => {
  it('marks a scan that filled its limit as a floor, not a total', () => {
    expect(boundedCount(60, 60)).toEqual({ ok: true, count: 60, atLeast: true });
    expect(formatBoundedCount(boundedCount(60, 60))).toBe('60+');
  });

  it('reports an exact figure when the scan came back short', () => {
    expect(boundedCount(4, 60)).toEqual({ ok: true, count: 4, atLeast: false });
    expect(formatBoundedCount(boundedCount(4, 60))).toBe('4');
  });

  it('never prints a number for a failed scan', () => {
    expect(formatBoundedCount({ ok: false, reason: 'Firestore was unreachable.' })).toBe('—');
  });
});

/* ------------------------------------------------------------------ *
 * Attention queues
 * ------------------------------------------------------------------ */

describe('the attention queues', () => {
  it('puts the two queues where a client is stuck ahead of the machinery', () => {
    const order = ATTENTION_QUEUES.map((queue) => queue.id);
    expect(order.slice(0, 2)).toEqual(['awaiting_approval', 'lapsed_holds']);
    expect(order.indexOf('events_abandoned')).toBeGreaterThan(order.indexOf('missing_meet_link'));
    expect(order.indexOf('emails_failed')).toBeGreaterThan(order.indexOf('refunds_outstanding'));
  });

  it('says what each number counts and what happens if it is ignored', () => {
    for (const queue of ATTENTION_QUEUES) {
      expect(queue.label.length).toBeGreaterThan(0);
      expect(queue.meaning.length).toBeGreaterThan(0);
      expect(queue.consequence.length).toBeGreaterThan(0);
      // The consequence must add something, not echo the label back.
      expect(queue.consequence).not.toBe(queue.meaning);
      expect(queue.handledIn.length).toBeGreaterThan(0);
    }
  });

  it('only links to sections that are actually built', () => {
    // A row linking to a placeholder costs a click to discover the dead end. The
    // alternative is not a broken link, it is `href: null` plus `handledIn`.
    for (const queue of ATTENTION_QUEUES) {
      if (queue.href === null) continue;
      const pathname = queue.href.split('?')[0];
      const section = resolveAdminNavItem(pathname);
      expect(section, `${queue.id} links to ${pathname}`).not.toBeNull();
      expect(section?.status, `${queue.id} links to ${pathname}`).toBe('ready');
    }
  });

  it('carries filters the bookings screen will actually apply', () => {
    // The failure this catches: a link whose `status` value the bookings screen
    // does not recognise, which drops the filter and shows the whole list as
    // though it were the queue.
    const filtered = ATTENTION_QUEUES.filter((queue) => queue.href?.includes('?'));
    expect(filtered.length).toBeGreaterThan(0);

    for (const queue of filtered) {
      const query = queue.href!.split('?')[1];
      const parsed = parseAdminBookingsView(new URLSearchParams(query));
      expect(parsed.ignored, `${queue.id} query "${query}"`).toEqual([]);
      const narrowed =
        parsed.view.statusGroup !== null ||
        parsed.view.paymentGroup !== null ||
        parsed.view.therapistId !== null ||
        parsed.view.date !== null;
      expect(narrowed, `${queue.id} query "${query}" narrows nothing`).toBe(true);
    }
  });

  it('resolves a queue by id and refuses an unknown one', () => {
    expect(attentionQueue('awaiting_approval').label).toBe('Awaiting your approval');
    expect(() => attentionQueue('nope' as AttentionQueueId)).toThrow(/nope/);
  });
});

describe('summarising attention', () => {
  it('reports all clear only when every queue answered zero', () => {
    const summary = summariseAttention(ALL_ZERO);
    expect(summary.allClear).toBe(true);
    expect(summary.actionable).toEqual([]);
    expect(summary.unknown).toEqual([]);
    expect(summary.rows).toHaveLength(ATTENTION_QUEUES.length);
  });

  it('refuses to report all clear when a single source failed', () => {
    // The whole point of this module. An operator who reads "nothing needs
    // attention" walks away; if one scan silently failed, they walk away from a
    // real backlog.
    const summary = summariseAttention(
      counts({ refunds_outstanding: { ok: false, reason: 'Firestore was unreachable.' } })
    );
    expect(summary.allClear).toBe(false);
    expect(summary.actionable).toEqual([]);
    expect(summary.unknown.map((row) => row.definition.id)).toEqual(['refunds_outstanding']);
  });

  it('does not treat a failed scan as work either', () => {
    const summary = summariseAttention(
      counts({ emails_failed: { ok: false, reason: 'Firestore was unreachable.' } })
    );
    const row = summary.rows.find((candidate) => candidate.definition.id === 'emails_failed')!;
    expect(row.actionable).toBe(false);
    expect(row.unknown).toBe(true);
  });

  it('keeps queues in declaration order regardless of which have work', () => {
    const summary = summariseAttention(
      counts({ emails_failed: { ok: true, count: 9, atLeast: false } })
    );
    expect(summary.rows.map((row) => row.definition.id)).toEqual(
      ATTENTION_QUEUES.map((queue) => queue.id)
    );
    expect(summary.actionable.map((row) => row.definition.id)).toEqual(['emails_failed']);
    expect(summary.allClear).toBe(false);
  });

  it('counts a limit-filling scan as actionable', () => {
    const summary = summariseAttention(
      counts({ awaiting_approval: { ok: true, count: 25, atLeast: true } })
    );
    expect(summary.actionable).toHaveLength(1);
    expect(formatBoundedCount(summary.actionable[0].count)).toBe('25+');
  });
});

/* ------------------------------------------------------------------ *
 * Payment holds
 * ------------------------------------------------------------------ */

describe('classifying a payment hold', () => {
  const now = Date.parse('2026-09-05T10:00:00.000Z');

  it('calls a missing deadline unknown rather than lapsed', () => {
    // Most bookings carry no `holdExpiresAt`. Reading absence as expiry would
    // invent an entire backlog out of confirmed sessions.
    expect(classifyHold(null, now)).toEqual({ kind: 'unknown' });
    expect(classifyHold('not a date', now)).toEqual({ kind: 'unknown' });
    expect(describeHold({ kind: 'unknown' })).toBe('No hold deadline recorded');
  });

  it('treats the exact deadline as lapsed', () => {
    expect(classifyHold(new Date(now).toISOString(), now)).toEqual({ kind: 'lapsed', minutes: 0 });
    expect(describeHold({ kind: 'lapsed', minutes: 0 })).toBe('Hold just lapsed');
  });

  it('reports how long ago a hold lapsed', () => {
    const state = classifyHold(new Date(now - 7 * 60_000).toISOString(), now);
    expect(state).toEqual({ kind: 'lapsed', minutes: 7 });
    expect(describeHold(state)).toBe('Hold lapsed 7 min ago');
  });

  it('flags a hold inside the warning window as expiring', () => {
    const state = classifyHold(new Date(now + HOLD_EXPIRING_SOON_MINUTES * 60_000).toISOString(), now);
    expect(state.kind).toBe('expiring');
    expect(describeHold(state)).toBe(`Lapses in ${HOLD_EXPIRING_SOON_MINUTES} min`);
  });

  it('leaves a hold outside the warning window as simply holding', () => {
    const state = classifyHold(
      new Date(now + (HOLD_EXPIRING_SOON_MINUTES + 1) * 60_000 + 1).toISOString(),
      now
    );
    expect(state.kind).toBe('holding');
    expect(describeHold(state)).toMatch(/left to pay$/);
  });

  it('formats long lapses in hours and days', () => {
    expect(describeHold(classifyHold(new Date(now - 90 * 60_000).toISOString(), now))).toBe(
      'Hold lapsed 1 hr 30 min ago'
    );
    expect(describeHold(classifyHold(new Date(now - 120 * 60_000).toISOString(), now))).toBe(
      'Hold lapsed 2 hr ago'
    );
    expect(describeHold(classifyHold(new Date(now - 48 * 60 * 60_000).toISOString(), now))).toBe(
      'Hold lapsed 2 days ago'
    );
  });
});

/* ------------------------------------------------------------------ *
 * Today's schedule
 * ------------------------------------------------------------------ */

describe("ordering today's schedule", () => {
  const date = '2026-09-05';
  /** 11:00 IST on that date, as epoch millis. */
  const elevenIst = Date.parse('2026-09-05T05:30:00.000Z');

  const rows = [
    { id: 'c', date, time: '14:00' },
    { id: 'a', date, time: '09:00' },
    { id: 'b', date, time: '11:00' },
  ];

  it('sorts by session start rather than by insertion order', () => {
    const schedule = orderTodaySchedule(rows, elevenIst);
    expect(schedule.entries.map((entry) => entry.row.id)).toEqual(['a', 'b', 'c']);
  });

  it('marks phases from the clock, not from booking status', () => {
    const schedule = orderTodaySchedule(rows, elevenIst);
    // 09:00 finished 45 minutes later; 11:00 has just started; 14:00 is ahead.
    expect(schedule.entries.map((entry) => entry.phase)).toEqual(['done', 'now', 'next']);
    expect(schedule.done).toBe(1);
    expect(schedule.inProgress).toBe(1);
    expect(schedule.remaining).toBe(1);
  });

  it('counts a session as running until its full duration has elapsed', () => {
    const oneMinuteBeforeEnd = elevenIst + (SESSION_DURATION_MINUTES - 1) * 60_000;
    const justAfterEnd = elevenIst + SESSION_DURATION_MINUTES * 60_000;
    expect(orderTodaySchedule([{ id: 'b', date, time: '11:00' }], oneMinuteBeforeEnd).entries[0].phase).toBe('now');
    expect(orderTodaySchedule([{ id: 'b', date, time: '11:00' }], justAfterEnd).entries[0].phase).toBe('done');
  });

  it('names exactly one session as next and reports when it starts', () => {
    const schedule = orderTodaySchedule(rows, Date.parse('2026-09-05T02:00:00.000Z')); // 07:30 IST
    expect(schedule.entries.map((entry) => entry.phase)).toEqual(['next', 'later', 'later']);
    expect(schedule.nextStartMs).toBe(Date.parse('2026-09-05T03:30:00.000Z')); // 09:00 IST
    expect(schedule.done).toBe(0);
    expect(schedule.inProgress).toBe(0);
    expect(schedule.remaining).toBe(3);
  });

  it('leaves nextStartMs null once nothing is ahead', () => {
    const schedule = orderTodaySchedule(rows, Date.parse('2026-09-05T20:00:00.000Z'));
    expect(schedule.nextStartMs).toBeNull();
    expect(schedule.done).toBe(3);
    expect(schedule.remaining).toBe(0);
  });

  it('sorts unreadable times last and counts them apart', () => {
    // A booking whose stored time cannot be turned into an instant is an
    // exception to chase, not something to silently drop from the day.
    const schedule = orderTodaySchedule(
      [
        { id: 'broken', date, time: '25:00' },
        { id: 'a', date, time: '09:00' },
      ],
      elevenIst
    );
    expect(schedule.entries.map((entry) => entry.row.id)).toEqual(['a', 'broken']);
    expect(schedule.entries[1]).toMatchObject({ phase: 'unknown', startMs: null });
    expect(schedule.unreadable).toBe(1);
    expect(schedule.total).toBe(2);
    // Every row is accounted for in exactly one bucket.
    expect(schedule.done + schedule.inProgress + schedule.remaining + schedule.unreadable).toBe(2);
  });

  it('handles an empty day without inventing a next session', () => {
    const schedule = orderTodaySchedule([], elevenIst);
    expect(schedule).toMatchObject({ total: 0, done: 0, inProgress: 0, remaining: 0, unreadable: 0, nextStartMs: null });
    expect(schedule.entries).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Background machinery
 * ------------------------------------------------------------------ */

describe('reading the background machinery', () => {
  const now = Date.parse('2026-09-05T10:00:00.000Z');

  function waiting(minutesAgo: number, nextAttemptMinutesFromNow: number | null): WaitingEvent {
    return {
      createdAtIso: new Date(now - minutesAgo * 60_000).toISOString(),
      nextAttemptAtIso:
        nextAttemptMinutesFromNow === null
          ? null
          : new Date(now + nextAttemptMinutesFromNow * 60_000).toISOString(),
      status: 'pending',
    };
  }

  function observation(overrides: Partial<OutboxObservation> = {}): OutboxObservation {
    return {
      waiting: { ok: true, count: 0, atLeast: false },
      dead: { ok: true, count: 0, atLeast: false },
      sample: [],
      ...overrides,
    };
  }

  it('always states what it cannot observe', () => {
    // There is no heartbeat to read. Every verdict on this page carries that.
    for (const reading of [
      readMachinery(observation(), now),
      readMachinery(observation({ waiting: { ok: false, reason: 'unreachable' } }), now),
      readMachinery(observation({ waiting: { ok: true, count: 3, atLeast: false }, sample: [waiting(2, null)] }), now),
    ]) {
      expect(reading.caveat).toBe(MACHINERY_CAVEAT);
    }
    expect(MACHINERY_CAVEAT).toContain('no cron run log');
    expect(MACHINERY_CAVEAT).toContain('does not prove');
  });

  it('reports unknown rather than idle when a scan failed', () => {
    const reading = readMachinery(observation({ dead: { ok: false, reason: 'Firestore was unreachable.' } }), now);
    expect(reading.verdict).toBe('unknown');
    expect(reading.detail.join(' ')).toContain('Firestore was unreachable.');
    expect(reading.oldestOverdueMinutes).toBeNull();
  });

  it('calls an empty queue idle without claiming the cron ran', () => {
    const reading = readMachinery(observation(), now);
    expect(reading.verdict).toBe('idle');
    expect(reading.headline).toBe('No background events are waiting.');
    expect(reading.headline.toLowerCase()).not.toContain('healthy');
    expect(reading.detail.join(' ')).toContain('No events have been abandoned.');
  });

  it('does not call a backing-off event a stall', () => {
    // An event that failed goes back to pending with a backoff up to an hour out.
    // Age alone would flag a working retry as a dead worker.
    const reading = readMachinery(
      observation({
        waiting: { ok: true, count: 1, atLeast: false },
        sample: [waiting(50, 10)],
      }),
      now
    );
    expect(reading.verdict).toBe('working');
    expect(reading.oldestOverdueMinutes).toBeNull();
    expect(reading.detail.join(' ')).toContain('inside its retry backoff');
  });

  it('calls it stalled once a due event has waited past the tolerance', () => {
    const reading = readMachinery(
      observation({
        waiting: { ok: true, count: 2, atLeast: false },
        sample: [waiting(MACHINERY_STALL_MINUTES, null), waiting(3, null)],
      }),
      now
    );
    expect(reading.verdict).toBe('stalled');
    expect(reading.oldestOverdueMinutes).toBe(MACHINERY_STALL_MINUTES);
    expect(reading.detail.join(' ')).toContain('five minutes');
  });

  it('stays at working just inside the tolerance', () => {
    const reading = readMachinery(
      observation({
        waiting: { ok: true, count: 1, atLeast: false },
        sample: [waiting(MACHINERY_STALL_MINUTES - 1, null)],
      }),
      now
    );
    expect(reading.verdict).toBe('working');
    expect(reading.oldestOverdueMinutes).toBe(MACHINERY_STALL_MINUTES - 1);
  });

  it('treats an elapsed backoff as due', () => {
    const reading = readMachinery(
      observation({
        waiting: { ok: true, count: 1, atLeast: false },
        sample: [waiting(40, -5)],
      }),
      now
    );
    expect(reading.verdict).toBe('stalled');
    expect(reading.oldestOverdueMinutes).toBe(40);
  });

  it('says the backlog is larger than the number shown when the scan filled', () => {
    const reading = readMachinery(
      observation({ waiting: { ok: true, count: 60, atLeast: true }, sample: [waiting(1, null)] }),
      now
    );
    expect(reading.detail.join(' ')).toContain('the real backlog is larger');
  });

  it('spells out that abandoned events will not be retried', () => {
    const reading = readMachinery(observation({ dead: { ok: true, count: 3, atLeast: false } }), now);
    expect(reading.detail.join(' ')).toContain('will not be retried');
  });

  it('ignores a sample entry with no readable creation time', () => {
    const reading = readMachinery(
      observation({
        waiting: { ok: true, count: 1, atLeast: false },
        sample: [{ createdAtIso: null, nextAttemptAtIso: null, status: 'pending' }],
      }),
      now
    );
    expect(reading.verdict).toBe('working');
    expect(reading.oldestOverdueMinutes).toBeNull();
  });
});
