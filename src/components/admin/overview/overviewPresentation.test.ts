import { describe, it, expect } from 'vitest';
import { describeDayProgress, phasePresentation, queueDestination } from './overviewPresentation';
import {
  attentionQueue,
  orderTodaySchedule,
  type TodaySchedule,
} from '@/domains/admin/overviewTriage';
import { ADMIN_NAV_ITEMS } from '../shell/navigation';

function schedule(overrides: Partial<TodaySchedule<unknown>>): TodaySchedule<unknown> {
  return {
    entries: [],
    total: 0,
    done: 0,
    inProgress: 0,
    remaining: 0,
    unreadable: 0,
    nextStartMs: null,
    ...overrides,
  };
}

describe('phasePresentation', () => {
  it('does not claim a passed slot was completed', () => {
    const passed = phasePresentation('done');
    // Completion is a status transition a cron performs; the phase is the clock.
    expect(passed.label).toBe('Slot passed');
    expect(passed.label.toLowerCase()).not.toContain('complet');
    expect(passed.title).toContain('not the booking status');
  });

  it('marks an unreadable time as something to look at, not as neutral', () => {
    expect(phasePresentation('unknown').tone).toBe('warning');
  });

  it('gives every phase a label and a reason', () => {
    for (const phase of ['done', 'now', 'next', 'later', 'unknown'] as const) {
      const presentation = phasePresentation(phase);
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.title.length).toBeGreaterThan(0);
    }
  });
});

describe('describeDayProgress', () => {
  it('says so plainly when the day is empty', () => {
    expect(describeDayProgress(schedule({}))).toBe('No sessions scheduled today.');
  });

  it('accounts for every session in exactly one clause', () => {
    const sentence = describeDayProgress(
      schedule({ total: 6, done: 2, inProgress: 1, remaining: 2, unreadable: 1 })
    );

    expect(sentence).toBe(
      '6 sessions today: 2 passed, 1 in progress, 2 still to come, 1 with an unreadable time.'
    );
  });

  it('omits the clauses that are zero', () => {
    expect(describeDayProgress(schedule({ total: 3, remaining: 3 }))).toBe(
      '3 sessions today: 3 still to come.'
    );
  });

  it('mentions unreadable rows rather than letting the numbers not add up', () => {
    // Without this clause the sentence would read "4 sessions today: 3 passed",
    // and an operator would go looking for a session that is in the list all along.
    const sentence = describeDayProgress(schedule({ total: 4, done: 3, unreadable: 1 }));
    expect(sentence).toContain('1 with an unreadable time');

    const plural = describeDayProgress(schedule({ total: 5, done: 3, unreadable: 2 }));
    expect(plural).toContain('2 with unreadable times');
  });

  it('agrees with a real schedule', () => {
    const nowMs = Date.parse('2026-09-05T05:00:00.000Z'); // 10:30 IST
    const real = orderTodaySchedule(
      [
        { date: '2026-09-05', time: '09:00' },
        { date: '2026-09-05', time: '10:15' },
        { date: '2026-09-05', time: '16:00' },
        { date: '2026-09-05', time: 'whenever' },
      ],
      nowMs
    );

    expect(describeDayProgress(real)).toBe(
      '4 sessions today: 1 passed, 1 in progress, 1 still to come, 1 with an unreadable time.'
    );
  });
});

describe('queueDestination', () => {
  it('sends approvals to the bookings list, which is built', () => {
    const destination = queueDestination(attentionQueue('awaiting_approval'));

    expect(destination.href).toBe('/admin/bookings?status=awaiting_approval');
    expect(destination.cta).toBe('Open in Bookings');
    expect(destination.note).toBeNull();
  });

  it('links Meet-less sessions to bookings while saying where they are actually fixed', () => {
    const destination = queueDestination(attentionQueue('missing_meet_link'));

    // The link is useful — those sessions can be seen — but retrying is not there.
    expect(destination.href).toBe('/admin/bookings?status=confirmed');
    expect(destination.cta).toBe('Open in Bookings');
    expect(destination.note).toContain('Calendar & Meet');
    expect(destination.note).toContain('not built yet');
  });

  it('refuses to offer a link into a section that does not exist yet', () => {
    // Background jobs is still unbuilt, so both of its queues have nowhere to send
    // an operator. Refunds has shipped and is covered by the test below instead.
    for (const id of ['events_abandoned', 'emails_failed'] as const) {
      const destination = queueDestination(attentionQueue(id));
      expect(destination.href).toBeNull();
      expect(destination.cta).toContain('Handled in');
      expect(destination.note).toContain('not built yet');
    }
  });

  it('links on its own once the owning section ships', () => {
    // The rule reads `status` from the navigation model, so flipping Refunds to
    // 'ready' was the only edit that made this queue clickable — no change here.
    const refunds = ADMIN_NAV_ITEMS.find((item) => item.label === 'Refunds');
    expect(refunds?.status).toBe('ready');

    const destination = queueDestination(attentionQueue('refunds_outstanding'));
    expect(destination.href).toBe(refunds?.href ?? null);
    expect(destination.cta).toBe('Open in Refunds');
    expect(destination.note).toBeNull();
  });
});
