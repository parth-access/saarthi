import { describe, expect, it } from 'vitest';
import { buildWeeklySchedule, type AdminScheduleOverride, type AdminScheduleRule } from '@/domains/admin/therapistSchedule';
import {
  describeActiveStatus,
  describeBreaks,
  describeCadence,
  describeOverride,
  describeWindow,
  readDay,
  summarizeForRoster,
  weekdayName,
} from './therapistsPresentation';

/**
 * The sentences a therapist's schedule turns into. Every test here is about a
 * distinction that would mislead an operator if it collapsed: a day never set up
 * vs a day switched off, an active rule that silently yields no slots, a cadence
 * that has drifted from the 45-minute session, a failed read vs an empty one.
 */

function rule(overrides: Partial<AdminScheduleRule> = {}): AdminScheduleRule {
  return {
    id: 'r1',
    dayOfWeek: 3,
    isActive: true,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 45,
    cooldownGap: 0,
    breaks: [],
    ...overrides,
  };
}

function dayFor(rules: AdminScheduleRule[]) {
  return buildWeeklySchedule(rules)[3];
}

function override(overrides: Partial<AdminScheduleOverride> = {}): AdminScheduleOverride {
  return {
    id: 'o1',
    date: '2026-09-20',
    type: 'blocked',
    startTime: null,
    endTime: null,
    slotDuration: null,
    cooldownGap: null,
    breaks: [],
    reason: null,
    ...overrides,
  };
}

describe('weekdayName', () => {
  it('indexes Sunday first, matching how dayOfWeek is stored', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(6)).toBe('Saturday');
  });

  it('shows an out-of-range day rather than an empty label', () => {
    expect(weekdayName(9)).toBe('Day 9');
  });
});

describe('readDay — the four states a day can be in', () => {
  it('separates a day never set up from a day switched off', () => {
    expect(readDay(dayFor([])).state).toBe('closed');
    expect(readDay(dayFor([rule({ isActive: false })])).state).toBe('disabled');
  });

  it('names an active rule that produces no slots as a problem, not as closed', () => {
    // A window shorter than one session: active, looks set up, offers nothing.
    const reading = readDay(dayFor([rule({ startTime: '09:00', endTime: '09:30' })]));
    expect(reading.state).toBe('problem');
    expect(reading.detail).toContain('no bookable start times');
  });

  it('treats an unparseable window as a problem too', () => {
    expect(readDay(dayFor([rule({ endTime: 'evening' })])).state).toBe('problem');
  });

  it('counts the slots and states the first and last for an open day', () => {
    const reading = readDay(dayFor([rule({ startTime: '09:00', endTime: '10:30' })]));
    expect(reading.state).toBe('open');
    expect(reading.label).toBe('2 slots');
    expect(reading.detail).toContain('09:00');
    expect(reading.detail).toContain('09:45');
  });

  it('says how many rules are switched off when there is more than one', () => {
    const reading = readDay(dayFor([rule({ id: 'a', isActive: false }), rule({ id: 'b', isActive: false })]));
    expect(reading.detail).toContain('2 rules');
  });
});

describe('describeWindow and describeBreaks', () => {
  it('renders a window as a range and admits missing hours', () => {
    expect(describeWindow('09:00', '17:00')).toBe('09:00 – 17:00');
    expect(describeWindow('', '17:00')).toBe('Hours not recorded');
  });

  it('returns null when there are no usable breaks, and pluralises otherwise', () => {
    expect(describeBreaks([])).toBeNull();
    expect(describeBreaks([{ startTime: '', endTime: '' }])).toBeNull();
    expect(describeBreaks([{ startTime: '11:30', endTime: '13:00' }])).toBe('Break 11:30 – 13:00');
    expect(
      describeBreaks([
        { startTime: '11:30', endTime: '12:00' },
        { startTime: '15:00', endTime: '15:30' },
      ])
    ).toContain('Breaks');
  });
});

describe('describeCadence — states the standard only when it has been left', () => {
  it('says nothing about the standard when the cadence matches it', () => {
    expect(describeCadence(45, 0)).toBe('45-minute sessions');
  });

  it('names the standard when the session length differs', () => {
    expect(describeCadence(60, 0)).toContain('standard is 45 minutes');
  });

  it('reports a gap and flags it as off-standard', () => {
    const text = describeCadence(45, 15);
    expect(text).toContain('15-minute gap');
    expect(text).toContain('standard');
  });

  it('admits an unusable session length', () => {
    expect(describeCadence(0, 0)).toContain('not usable');
  });
});

describe('describeOverride', () => {
  it('says a blocked day is closed regardless of the weekly rules', () => {
    expect(describeOverride(override())).toContain('Closed all day');
  });

  it('carries the reason when one was recorded', () => {
    expect(describeOverride(override({ reason: 'Leave' }))).toContain('Leave');
  });

  it('warns that an available override with no session length falls back to 60 minutes', () => {
    const text = describeOverride(
      override({ type: 'available', startTime: '18:00', endTime: '20:00', slotDuration: null })
    );
    expect(text).toContain('60 minutes');
  });

  it('does not warn when the override carries its own session length', () => {
    const text = describeOverride(
      override({ type: 'available', startTime: '18:00', endTime: '20:00', slotDuration: 45 })
    );
    expect(text).not.toContain('falls back');
  });
});

describe('summarizeForRoster', () => {
  it('distinguishes a failed schedule read from an empty schedule', () => {
    const failed = summarizeForRoster(null);
    expect(failed.text).toContain('could not be read');
    expect(failed.warning).toContain('failed read');
  });

  it('warns when a therapist has no working days at all', () => {
    const summary = summarizeForRoster({ openDays: 0, hasCadenceDrift: false, hasInactiveRule: false });
    expect(summary.text).toBe('No working days');
    expect(summary.warning).toContain('No availability rules');
  });

  it('says so when every rule is switched off rather than absent', () => {
    const summary = summarizeForRoster({ openDays: 0, hasCadenceDrift: false, hasInactiveRule: true });
    expect(summary.warning).toContain('switched off');
  });

  it('counts working days and surfaces cadence drift', () => {
    const clean = summarizeForRoster({ openDays: 5, hasCadenceDrift: false, hasInactiveRule: false });
    expect(clean.text).toBe('5 working days a week');
    expect(clean.warning).toBeNull();
    const drifted = summarizeForRoster({ openDays: 1, hasCadenceDrift: true, hasInactiveRule: false });
    expect(drifted.text).toBe('1 working day a week');
    expect(drifted.warning).toContain('45-minute');
  });
});

describe('describeActiveStatus', () => {
  it('says an inactive therapist is hidden but their bookings still stand', () => {
    const inactive = describeActiveStatus(false);
    expect(inactive.label).toBe('Not accepting bookings');
    expect(inactive.detail).toContain('Existing bookings are unaffected');
  });

  it('says an active therapist is offered on the booking page', () => {
    expect(describeActiveStatus(true).detail).toContain('booking page');
  });
});
