import { describe, expect, it } from 'vitest';
import {
  STANDARD_SLOT_MINUTES,
  buildWeeklySchedule,
  classifyCadence,
  previewRuleSlots,
  summarizeSchedule,
  type AdminScheduleRule,
} from './therapistSchedule';

/**
 * The schedule view's two load-bearing jobs: producing the exact bookable grid a
 * rule offers (so the console cannot disagree with the booking flow), and naming
 * where a rule's cadence has drifted from the 45-minute standard (so a 60-minute
 * session or a between-session gap is surfaced, never silently reshaping the day).
 */

function rule(overrides: Partial<AdminScheduleRule> = {}): AdminScheduleRule {
  return {
    id: 'rule_1',
    dayOfWeek: 3, // Wednesday
    isActive: true,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 45,
    cooldownGap: 0,
    breaks: [{ startTime: '11:30', endTime: '13:00' }],
    ...overrides,
  };
}

/** The grid the production cadence (45/0, 09:00–17:00, midday break) must produce. */
const FULL_WED_GRID = ['09:00', '09:45', '10:30', '13:00', '13:45', '14:30', '15:15', '16:00'];

describe('classifyCadence — the 45-minute standard', () => {
  it('reads 45 minutes with no gap as standard, with nothing to flag', () => {
    const reading = classifyCadence(STANDARD_SLOT_MINUTES, 0);
    expect(reading.standard).toBe(true);
    expect(reading.notes).toEqual([]);
  });

  it('flags a non-45 session length without rejecting it', () => {
    const reading = classifyCadence(60, 0);
    expect(reading.standard).toBe(false);
    expect(reading.notes).toHaveLength(1);
    expect(reading.notes[0]).toContain('60-minute');
  });

  it('flags a 30-minute session too — any divergence is surfaced', () => {
    expect(classifyCadence(30, 0).standard).toBe(false);
  });

  it('flags a between-session gap as a separate note', () => {
    const reading = classifyCadence(45, 15);
    expect(reading.standard).toBe(false);
    expect(reading.notes.some((note) => note.includes('15-minute gap'))).toBe(true);
  });

  it('names both divergences when a rule differs on length and gap', () => {
    const reading = classifyCadence(60, 15);
    expect(reading.notes).toHaveLength(2);
  });

  it('flags an unusable session length rather than trusting it', () => {
    expect(classifyCadence(0, 0).standard).toBe(false);
    expect(classifyCadence(Number.NaN, 0).standard).toBe(false);
  });
});

describe('previewRuleSlots — the grid a rule actually offers', () => {
  it('produces the production 45-minute grid around the midday break', () => {
    expect(previewRuleSlots(rule())).toEqual(FULL_WED_GRID);
  });

  it('offers fewer, wider-spaced slots once a gap is added', () => {
    const slots = previewRuleSlots(rule({ slotDuration: 60, cooldownGap: 0, breaks: [] }));
    // 09:00–17:00 in 60-minute steps: 8 slots, on the hour.
    expect(slots).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  });

  it('returns nothing for an unparseable window', () => {
    expect(previewRuleSlots(rule({ startTime: 'not-a-time' }))).toEqual([]);
  });
});

describe('buildWeeklySchedule — seven days, Sunday first', () => {
  it('returns exactly seven days indexed by dayOfWeek', () => {
    const week = buildWeeklySchedule([]);
    expect(week).toHaveLength(7);
    week.forEach((day, index) => expect(day.dayOfWeek).toBe(index));
  });

  it('places a rule on its day with the grid it produces, and leaves the rest closed', () => {
    const week = buildWeeklySchedule([rule()]);
    const wed = week[3];
    expect(wed.open).toBe(true);
    expect(wed.slots).toEqual(FULL_WED_GRID);
    expect(wed.standard).toBe(true);
    expect(week[1].open).toBe(false);
    expect(week[1].slots).toEqual([]);
  });

  it('shows an inactive rule as a switched-off day that offers nothing', () => {
    const week = buildWeeklySchedule([rule({ isActive: false })]);
    const wed = week[3];
    expect(wed.open).toBe(false);
    expect(wed.hasInactiveRule).toBe(true);
    expect(wed.slots).toEqual([]);
  });

  it('unions the grids of two active rules on the same day, sorted and de-duplicated', () => {
    const morning = rule({ id: 'a', startTime: '09:00', endTime: '10:30', breaks: [] });
    const evening = rule({ id: 'b', startTime: '15:00', endTime: '16:30', breaks: [] });
    const wed = buildWeeklySchedule([evening, morning])[3];
    expect(wed.slots).toEqual(['09:00', '09:45', '15:00', '15:45']);
  });

  it('marks the day non-standard and carries the cadence notes when a rule has drifted', () => {
    const wed = buildWeeklySchedule([rule({ slotDuration: 60, cooldownGap: 15, breaks: [] })])[3];
    expect(wed.standard).toBe(false);
    expect(wed.cadenceNotes.length).toBeGreaterThan(0);
  });
});

describe('summarizeSchedule — the roster one-liner', () => {
  it('counts only genuinely open days', () => {
    const summary = summarizeSchedule([rule({ dayOfWeek: 1 }), rule({ dayOfWeek: 2, isActive: false })]);
    expect(summary.openDays).toBe(1);
    expect(summary.hasInactiveRule).toBe(true);
  });

  it('reports cadence drift when any open day has drifted', () => {
    expect(summarizeSchedule([rule()]).hasCadenceDrift).toBe(false);
    expect(summarizeSchedule([rule({ slotDuration: 60 })]).hasCadenceDrift).toBe(true);
  });
});
