import { describe, expect, it } from 'vitest';
import {
  ALLOWED_SLOT_MINUTES,
  MAX_COOLDOWN_MINUTES,
  STRANDED_SCAN_LIMIT,
  assessScheduleImpact,
  cadenceWarning,
  checkOverrideDraft,
  checkRuleDraft,
  describeImpact,
  isCalendarDate,
  isTimeOffered,
  projectOverrides,
  projectRules,
  type ScheduleOverrideDraft,
  type ScheduleRuleDraft,
  type StrandCandidate,
} from './therapistScheduleWrite';
import type { AdminScheduleOverride, AdminScheduleRule } from './therapistSchedule';

/**
 * The write side of schedule management, where every judgement is one an operator
 * cannot make for themselves: whether a proposed rule is storable at all, and what
 * applying it would do to sessions people have already booked.
 *
 * Two behaviours here are worth more than the rest and are tested hardest. A
 * window that produces zero start times must be rejected, because Firestore will
 * happily store it and the roster will happily show it as a working day. And a
 * booking that was *already* outside the stored hours must never be blamed on the
 * edit in front of the operator — a warning that cries wolf is a warning that gets
 * clicked through.
 */

function rule(overrides: Partial<AdminScheduleRule> = {}): AdminScheduleRule {
  return {
    id: 'rule_1',
    dayOfWeek: 1, // Monday
    isActive: true,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 45,
    cooldownGap: 0,
    breaks: [],
    ...overrides,
  };
}

function dateOverride(overrides: Partial<AdminScheduleOverride> = {}): AdminScheduleOverride {
  return {
    id: 'ovr_1',
    date: '2026-09-07',
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

function ruleDraft(overrides: Partial<ScheduleRuleDraft> = {}): ScheduleRuleDraft {
  return {
    dayOfWeek: 1,
    isActive: true,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 45,
    cooldownGap: 0,
    breaks: [],
    ...overrides,
  };
}

function overrideDraft(overrides: Partial<ScheduleOverrideDraft> = {}): ScheduleOverrideDraft {
  return {
    date: '2026-09-07',
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

function booking(overrides: Partial<StrandCandidate> = {}): StrandCandidate {
  return {
    id: 'bk_1',
    date: '2026-09-07', // a Monday
    time: '09:00',
    status: 'confirmed',
    clientName: 'A Client',
    ...overrides,
  };
}

/** The rejection sentence, or a failure that names what came back instead. */
function problem(check: ReturnType<typeof checkRuleDraft>): string {
  if (check.ok) throw new Error(`expected a rejection, got ok with warnings: ${JSON.stringify(check.warnings)}`);
  return check.problem;
}

describe('cadenceWarning — keep the choice, state the cost', () => {
  it('says nothing when the draft is the practice’s 45-minute session', () => {
    expect(cadenceWarning(45, 0)).toBeNull();
  });

  it('names the session length when it diverges, and says it is allowed', () => {
    const warning = cadenceWarning(60, 0);
    expect(warning).toContain('60 minutes');
    expect(warning).toContain('45-minute');
    expect(warning).toContain('allowed');
  });

  it('names a between-session gap separately', () => {
    expect(cadenceWarning(45, 15)).toContain('15-minute gap');
  });

  it('names both divergences at once', () => {
    const warning = cadenceWarning(30, 10) ?? '';
    expect(warning).toContain('30 minutes');
    expect(warning).toContain('10-minute gap');
  });
});

describe('checkRuleDraft — what may be stored as a weekly rule', () => {
  it('accepts the production shape with nothing to warn about', () => {
    const check = checkRuleDraft(ruleDraft(), []);
    expect(check).toEqual({ ok: true, warnings: [] });
  });

  it('accepts a rule with breaks inside the window', () => {
    const check = checkRuleDraft(ruleDraft({ breaks: [{ startTime: '11:30', endTime: '13:00' }] }), []);
    expect(check.ok).toBe(true);
  });

  it.each([-1, 7, 1.5, Number.NaN])('rejects %s as a weekday', (dayOfWeek) => {
    expect(problem(checkRuleDraft(ruleDraft({ dayOfWeek }), []))).toBe('Pick a weekday.');
  });

  it.each([40, 0, 45.5, Number.NaN])('rejects %s as a session length', (slotDuration) => {
    const message = problem(checkRuleDraft(ruleDraft({ slotDuration }), []));
    expect(message).toContain(ALLOWED_SLOT_MINUTES.join(', '));
    expect(message).toContain('no start times');
  });

  it('accepts every length the existing editor offers', () => {
    for (const slotDuration of ALLOWED_SLOT_MINUTES) {
      expect(checkRuleDraft(ruleDraft({ slotDuration }), []).ok).toBe(true);
    }
  });

  it.each([-1, MAX_COOLDOWN_MINUTES + 1, 5.5])('rejects %s as a between-session gap', (cooldownGap) => {
    expect(problem(checkRuleDraft(ruleDraft({ cooldownGap }), []))).toContain(`0 to ${MAX_COOLDOWN_MINUTES}`);
  });
});

describe('checkRuleDraft — the working window', () => {
  it.each(['9:00', '25:00', '09:60', '', 'morning'])('rejects %o as a time', (startTime) => {
    expect(problem(checkRuleDraft(ruleDraft({ startTime }), []))).toContain('zero-padded');
  });

  it('rejects an end time that is not after the start', () => {
    expect(problem(checkRuleDraft(ruleDraft({ startTime: '17:00', endTime: '09:00' }), []))).toBe(
      'The end time must be later than the start time.'
    );
    expect(problem(checkRuleDraft(ruleDraft({ startTime: '09:00', endTime: '09:00' }), []))).toContain('later');
  });

  it('rejects a break that ends before it starts', () => {
    const draft = ruleDraft({ breaks: [{ startTime: '13:00', endTime: '11:30' }] });
    expect(problem(checkRuleDraft(draft, []))).toContain('ends before it starts');
  });

  it('rejects a break outside the working window', () => {
    const draft = ruleDraft({ breaks: [{ startTime: '18:00', endTime: '19:00' }] });
    expect(problem(checkRuleDraft(draft, []))).toContain('outside the working window');
  });

  it('rejects breaks that overlap each other', () => {
    const draft = ruleDraft({
      breaks: [
        { startTime: '11:00', endTime: '12:30' },
        { startTime: '12:00', endTime: '13:00' },
      ],
    });
    expect(problem(checkRuleDraft(draft, []))).toContain('overlap each other');
  });

  it('accepts back-to-back breaks, which do not overlap', () => {
    const draft = ruleDraft({
      breaks: [
        { startTime: '11:00', endTime: '12:00' },
        { startTime: '12:00', endTime: '13:00' },
      ],
    });
    expect(checkRuleDraft(draft, []).ok).toBe(true);
  });

  it('rejects a window too short for one session — the day would look open and offer nothing', () => {
    const draft = ruleDraft({ startTime: '09:00', endTime: '09:30', slotDuration: 45 });
    const message = problem(checkRuleDraft(draft, []));
    expect(message).toContain('would offer nothing');
    expect(message).toContain('09:00 – 09:30');
  });

  it('rejects a window whose breaks leave no room for a session', () => {
    const draft = ruleDraft({
      startTime: '09:00',
      endTime: '10:00',
      breaks: [{ startTime: '09:00', endTime: '10:00' }],
    });
    expect(problem(checkRuleDraft(draft, []))).toContain('would offer nothing');
  });
});

describe('checkRuleDraft — overlapping another rule on the same weekday', () => {
  const morning = rule({ id: 'rule_am', dayOfWeek: 1, startTime: '09:00', endTime: '13:00' });

  it('rejects a rule overlapping an active rule on that day, naming the other window', () => {
    const draft = ruleDraft({ dayOfWeek: 1, startTime: '12:00', endTime: '17:00' });
    const message = problem(checkRuleDraft(draft, [morning]));
    expect(message).toContain('09:00 – 13:00');
    expect(message).toContain('overlaps');
  });

  it('accepts a rule that starts exactly where the other ends', () => {
    const draft = ruleDraft({ dayOfWeek: 1, startTime: '13:00', endTime: '17:00' });
    expect(checkRuleDraft(draft, [morning]).ok).toBe(true);
  });

  it('accepts the same window on a different weekday', () => {
    const draft = ruleDraft({ dayOfWeek: 2, startTime: '09:00', endTime: '13:00' });
    expect(checkRuleDraft(draft, [morning]).ok).toBe(true);
  });

  it('ignores a switched-off rule — it contributes no start times to collide with', () => {
    const inactive = rule({ id: 'rule_off', dayOfWeek: 1, isActive: false });
    expect(checkRuleDraft(ruleDraft({ dayOfWeek: 1 }), [inactive]).ok).toBe(true);
  });

  it('does not let a rule conflict with itself when it is being edited', () => {
    const draft = ruleDraft({ dayOfWeek: 1, startTime: '10:00', endTime: '16:00' });
    expect(checkRuleDraft(draft, [morning], 'rule_am').ok).toBe(true);
  });

  it('skips the overlap check for a draft that is switched off', () => {
    const draft = ruleDraft({ dayOfWeek: 1, startTime: '12:00', endTime: '17:00', isActive: false });
    expect(checkRuleDraft(draft, [morning]).ok).toBe(true);
  });

  it('tolerates a stored rule with unreadable times instead of rejecting the edit', () => {
    const broken = rule({ id: 'rule_broken', dayOfWeek: 1, startTime: 'nonsense', endTime: '' });
    expect(checkRuleDraft(ruleDraft({ dayOfWeek: 1 }), [broken]).ok).toBe(true);
  });
});

describe('checkRuleDraft — cadence divergence warns but never blocks', () => {
  it('stores a 60-minute rule and says what changed', () => {
    const check = checkRuleDraft(ruleDraft({ slotDuration: 60 }), []);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toContain('60 minutes');
  });

  it('carries no warning for a gap of zero, the standard', () => {
    const check = checkRuleDraft(ruleDraft({ cooldownGap: 0 }), []);
    expect(check.ok && check.warnings).toEqual([]);
  });
});

describe('isCalendarDate — a real day, not merely a matching shape', () => {
  it('accepts an ordinary date', () => {
    expect(isCalendarDate('2026-09-07')).toBe(true);
  });

  it('rejects a date that does not exist', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-04-31')).toBe(false);
  });

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
  });

  it.each(['2026-9-5', '2026-13-01', '2026-00-10', '2026-09-00', '05-09-2026', '', '2026-09-07T00:00'])(
    'rejects %o',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    }
  );
});

describe('checkOverrideDraft — closing a day', () => {
  it('accepts a blocked day with only a date and a reason', () => {
    const check = checkOverrideDraft(overrideDraft({ reason: 'Public holiday' }), []);
    expect(check).toEqual({ ok: true, warnings: [] });
  });

  it('rejects an impossible date', () => {
    const check = checkOverrideDraft(overrideDraft({ date: '2026-02-30' }), []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toContain('YYYY-MM-DD');
  });

  it('rejects a second override on a date that already has one, naming which kind', () => {
    const existing = dateOverride({ id: 'ovr_existing', date: '2026-09-07', type: 'blocked' });
    const check = checkOverrideDraft(overrideDraft({ date: '2026-09-07', type: 'available' }), [existing]);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toContain('already has an override');
    expect(check.problem).toContain('closed');
  });

  it('describes an existing available override as replacement hours', () => {
    const existing = dateOverride({ id: 'ovr_existing', type: 'available' });
    const check = checkOverrideDraft(overrideDraft(), [existing]);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toContain('replacement hours');
  });

  it('lets the override already on that date be edited', () => {
    const existing = dateOverride({ id: 'ovr_existing' });
    expect(checkOverrideDraft(overrideDraft(), [existing], 'ovr_existing').ok).toBe(true);
  });

  it('ignores an override on a different date', () => {
    const existing = dateOverride({ id: 'ovr_other', date: '2026-09-08' });
    expect(checkOverrideDraft(overrideDraft({ date: '2026-09-07' }), [existing]).ok).toBe(true);
  });
});

describe('checkOverrideDraft — replacement hours for one date', () => {
  function available(extra: Partial<ScheduleOverrideDraft> = {}): ScheduleOverrideDraft {
    return overrideDraft({
      type: 'available',
      startTime: '10:00',
      endTime: '14:00',
      slotDuration: 45,
      cooldownGap: 0,
      ...extra,
    });
  }

  it('accepts a complete set of replacement hours', () => {
    expect(checkOverrideDraft(available(), [])).toEqual({ ok: true, warnings: [] });
  });

  it('rejects replacement hours with no start or end', () => {
    const check = checkOverrideDraft(available({ startTime: null }), []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toContain('need a start and an end');
  });

  it('rejects a missing session length, naming the 60-minute fallback it would inherit', () => {
    const check = checkOverrideDraft(available({ slotDuration: null }), []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toContain('60 minutes');
    expect(check.problem).toContain('45-minute');
  });

  it('rejects a session length the console does not offer', () => {
    const check = checkOverrideDraft(available({ slotDuration: 40 }), []);
    expect(check.ok).toBe(false);
  });

  it('treats an unset gap as none rather than rejecting it', () => {
    expect(checkOverrideDraft(available({ cooldownGap: null }), []).ok).toBe(true);
  });

  it('rejects an out-of-range gap', () => {
    const check = checkOverrideDraft(available({ cooldownGap: MAX_COOLDOWN_MINUTES + 30 }), []);
    expect(check.ok).toBe(false);
  });

  it('rejects a window that fits no session, because the date would override the week with nothing', () => {
    const check = checkOverrideDraft(available({ startTime: '10:00', endTime: '10:30' }), []);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problem).toContain('offer nothing');
    expect(check.problem).toContain('Close the day instead');
  });

  it('rejects malformed break times', () => {
    const check = checkOverrideDraft(available({ breaks: [{ startTime: '10', endTime: '11:00' }] }), []);
    expect(check.ok).toBe(false);
  });

  it('warns on a diverging cadence without blocking it', () => {
    const check = checkOverrideDraft(available({ slotDuration: 90 }), []);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.warnings[0]).toContain('90 minutes');
  });
});

describe('isTimeOffered — the same order the booking flow resolves', () => {
  const MONDAY = '2026-09-07';
  const monday = [rule({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' })];

  it('reads the weekday in UTC, so the fixture date really is a Monday', () => {
    expect(new Date(`${MONDAY}T00:00:00Z`).getUTCDay()).toBe(1);
  });

  it('offers a time the weekly grid lands on', () => {
    expect(isTimeOffered(monday, [], MONDAY, '09:00')).toBe(true);
    expect(isTimeOffered(monday, [], MONDAY, '15:45')).toBe(true);
  });

  it('does not offer a time between the grid’s start times', () => {
    expect(isTimeOffered(monday, [], MONDAY, '09:30')).toBe(false);
  });

  it('does not offer a session that would run past the end of the window', () => {
    expect(isTimeOffered(monday, [], MONDAY, '16:30')).toBe(false);
  });

  it('offers nothing on a weekday with no rule', () => {
    expect(isTimeOffered(monday, [], '2026-09-08', '09:00')).toBe(false);
  });

  it('offers nothing from a switched-off rule', () => {
    const off = [rule({ dayOfWeek: 1, isActive: false })];
    expect(isTimeOffered(off, [], MONDAY, '09:00')).toBe(false);
  });

  it('closes the day when a blocked override covers it, whatever the rule says', () => {
    const blocked = [dateOverride({ date: MONDAY, type: 'blocked' })];
    expect(isTimeOffered(monday, blocked, MONDAY, '09:00')).toBe(false);
  });

  it('replaces the weekly hours with an available override, not adds to them', () => {
    const replacement = [
      dateOverride({
        date: MONDAY,
        type: 'available',
        startTime: '18:00',
        endTime: '20:00',
        slotDuration: 45,
        cooldownGap: 0,
      }),
    ];
    expect(isTimeOffered(monday, replacement, MONDAY, '18:00')).toBe(true);
    expect(isTimeOffered(monday, replacement, MONDAY, '09:00')).toBe(false);
  });

  it('falls back to the weekly rules when an available override has no hours on it', () => {
    const useless = [dateOverride({ date: MONDAY, type: 'available', startTime: null, endTime: null })];
    expect(isTimeOffered(monday, useless, MONDAY, '09:00')).toBe(true);
  });

  it('unions two active rules on the same day, as the lister does', () => {
    const split = [
      rule({ id: 'am', dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }),
      rule({ id: 'pm', dayOfWeek: 1, startTime: '14:00', endTime: '16:00' }),
    ];
    expect(isTimeOffered(split, [], MONDAY, '09:00')).toBe(true);
    expect(isTimeOffered(split, [], MONDAY, '14:00')).toBe(true);
    expect(isTimeOffered(split, [], MONDAY, '12:00')).toBe(false);
  });
});

describe('projectRules / projectOverrides — the set as it would be stored', () => {
  const a = rule({ id: 'a' });
  const b = rule({ id: 'b', dayOfWeek: 2 });

  it('appends a rule whose id is not already stored', () => {
    const next = projectRules([a], { kind: 'save', rule: b });
    expect(next.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('replaces in place when the id already exists, keeping the count and the order', () => {
    const edited = rule({ id: 'a', startTime: '10:00' });
    const next = projectRules([a, b], { kind: 'save', rule: edited });
    expect(next).toHaveLength(2);
    expect(next[0].startTime).toBe('10:00');
    expect(next[1].id).toBe('b');
  });

  it('removes the rule named by a delete', () => {
    expect(projectRules([a, b], { kind: 'delete', ruleId: 'a' }).map((r) => r.id)).toEqual(['b']);
  });

  it('leaves the set alone when the deleted id is not there', () => {
    expect(projectRules([a], { kind: 'delete', ruleId: 'gone' })).toHaveLength(1);
  });

  it('does the same three things for overrides', () => {
    const one = dateOverride({ id: 'o1', date: '2026-09-07' });
    const two = dateOverride({ id: 'o2', date: '2026-09-08' });
    expect(projectOverrides([one], { kind: 'save', override: two }).map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(
      projectOverrides([one, two], { kind: 'save', override: dateOverride({ id: 'o1', reason: 'Diwali' }) })
    ).toHaveLength(2);
    expect(projectOverrides([one, two], { kind: 'delete', overrideId: 'o2' }).map((o) => o.id)).toEqual(['o1']);
  });
});

describe('assessScheduleImpact — what an edit would cost', () => {
  const MONDAY = '2026-09-07';
  const open = { rules: [rule({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' })], overrides: [] };
  const closed = { rules: [], overrides: [dateOverride({ date: MONDAY, type: 'blocked' })] };

  function assess(input: Partial<Parameters<typeof assessScheduleImpact>[0]> = {}) {
    return assessScheduleImpact({
      current: open,
      proposed: open,
      bookings: [],
      fromDate: MONDAY,
      atLeast: false,
      ...input,
    });
  }

  it('reports nothing, and needs no confirmation, when the schedule is unchanged', () => {
    const impact = assess({ bookings: [booking()] });
    expect(impact.stranded).toEqual([]);
    expect(impact.needsConfirmation).toBe(false);
    expect(impact.losesAllConfiguration).toBe(false);
  });

  it('reports a booking whose time the new schedule no longer offers', () => {
    const impact = assess({
      proposed: { rules: [rule({ dayOfWeek: 1, startTime: '13:00', endTime: '17:00' })], overrides: [] },
      bookings: [booking({ id: 'bk_am', time: '09:00' })],
    });
    expect(impact.stranded.map((b) => b.id)).toEqual(['bk_am']);
    expect(impact.needsConfirmation).toBe(true);
  });

  it('does not blame the edit for a booking that was already outside the stored hours', () => {
    const impact = assess({
      proposed: { rules: [rule({ dayOfWeek: 1, startTime: '13:00', endTime: '17:00' })], overrides: [] },
      bookings: [booking({ id: 'bk_odd', time: '08:15' })],
    });
    expect(impact.stranded).toEqual([]);
    expect(impact.needsConfirmation).toBe(false);
  });

  it('reports nothing when the change only widens the schedule', () => {
    const impact = assess({
      current: { rules: [rule({ dayOfWeek: 1, startTime: '09:00', endTime: '13:00' })], overrides: [] },
      proposed: open,
      bookings: [booking({ time: '09:00' })],
    });
    expect(impact.stranded).toEqual([]);
  });

  it('ignores bookings before the date the scan starts from', () => {
    const impact = assess({
      proposed: closed,
      bookings: [booking({ id: 'bk_past', date: '2026-08-31', time: '09:00' })],
      fromDate: MONDAY,
    });
    expect(impact.stranded).toEqual([]);
  });
});

describe('assessScheduleImpact — which bookings count, and admitting the bound', () => {
  const MONDAY = '2026-09-07';
  const open = { rules: [rule({ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' })], overrides: [] };
  const shutMonday = { rules: [], overrides: [dateOverride({ date: MONDAY, type: 'blocked' })] };

  function strandAll(bookings: readonly StrandCandidate[], atLeast = false) {
    return assessScheduleImpact({
      current: open,
      proposed: shutMonday,
      bookings,
      fromDate: MONDAY,
      atLeast,
    });
  }

  it.each(['pending', 'pending_approval', 'awaiting_payment', 'pending_payment', 'confirmed', 'rescheduled'])(
    'counts a %s booking as a session someone is still expecting',
    (status) => {
      expect(strandAll([booking({ status })]).stranded).toHaveLength(1);
    }
  );

  it.each(['cancelled', 'rejected', 'expired', 'no_show', 'completed', 'draft'])(
    'ignores a %s booking',
    (status) => {
      expect(strandAll([booking({ status })]).stranded).toEqual([]);
    }
  );

  it('orders the list by date then time, so it reads as a schedule', () => {
    const impact = strandAll([
      booking({ id: 'later', date: '2026-09-14', time: '09:00' }),
      booking({ id: 'second', date: MONDAY, time: '11:15' }),
      booking({ id: 'first', date: MONDAY, time: '09:00' }),
    ]);
    // 2026-09-14 has no override, and the proposed set has no rules, so it strands too.
    expect(impact.stranded.map((b) => b.id)).toEqual(['first', 'second', 'later']);
  });

  it('carries the client name through, because an operator has to contact them', () => {
    const impact = strandAll([booking({ clientName: 'Meera R' })]);
    expect(impact.stranded[0].clientName).toBe('Meera R');
  });

  it('does not report a booking whose stored date is unusable', () => {
    expect(strandAll([booking({ date: 'not-a-date' })]).stranded).toEqual([]);
  });

  it('requires confirmation when the scan was truncated, even with nothing found', () => {
    const impact = assessScheduleImpact({
      current: open,
      proposed: open,
      bookings: [],
      fromDate: MONDAY,
      atLeast: true,
    });
    expect(impact.stranded).toEqual([]);
    expect(impact.atLeast).toBe(true);
    expect(impact.needsConfirmation).toBe(true);
  });

  it('reports the scan limit, defaulting to the module’s own cap', () => {
    expect(strandAll([]).scanLimit).toBe(STRANDED_SCAN_LIMIT);
    expect(
      assessScheduleImpact({
        current: open,
        proposed: open,
        bookings: [],
        fromDate: MONDAY,
        atLeast: false,
        scanLimit: 25,
      }).scanLimit
    ).toBe(25);
  });
});

describe('assessScheduleImpact — removing the last of the schedule', () => {
  const MONDAY = '2026-09-07';
  const open = { rules: [rule({ dayOfWeek: 1 })], overrides: [] };

  it('flags an empty proposed schedule as its own consequence', () => {
    const impact = assessScheduleImpact({
      current: open,
      proposed: { rules: [], overrides: [] },
      bookings: [],
      fromDate: MONDAY,
      atLeast: false,
    });
    expect(impact.losesAllConfiguration).toBe(true);
    expect(impact.needsConfirmation).toBe(true);
  });

  it('does not flag it while any override remains', () => {
    const impact = assessScheduleImpact({
      current: open,
      proposed: { rules: [], overrides: [dateOverride()] },
      bookings: [],
      fromDate: MONDAY,
      atLeast: false,
    });
    expect(impact.losesAllConfiguration).toBe(false);
  });
});

describe('describeImpact — what the operator reads before confirming', () => {
  function impactOf(overrides: Partial<ReturnType<typeof assessScheduleImpact>>) {
    return {
      stranded: [],
      atLeast: false,
      scanLimit: STRANDED_SCAN_LIMIT,
      losesAllConfiguration: false,
      needsConfirmation: false,
      ...overrides,
    };
  }

  const stranded = (id: string) => ({
    id,
    date: '2026-09-07',
    time: '09:00',
    status: 'confirmed',
    clientName: 'A Client',
  });

  it('says nothing when there is nothing to weigh', () => {
    expect(describeImpact(impactOf({}))).toEqual([]);
  });

  it('promises the bookings are left alone — the reason this is confirmable at all', () => {
    const lines = describeImpact(impactOf({ stranded: [stranded('a')] })).join(' ');
    expect(lines).toContain('not cancelled');
    expect(lines).toContain('by hand');
  });

  it('reads as one booking, not "1 bookings"', () => {
    const lines = describeImpact(impactOf({ stranded: [stranded('a')] })).join(' ');
    expect(lines).toContain('1 booking sits');
    expect(lines).not.toContain('bookings sit');
  });

  it('reads as several when there are several', () => {
    const lines = describeImpact(impactOf({ stranded: [stranded('a'), stranded('b')] })).join(' ');
    expect(lines).toContain('2 bookings sit');
  });

  it('names the fail-open plainly, since an empty schedule opens the therapist up', () => {
    const lines = describeImpact(impactOf({ losesAllConfiguration: true })).join(' ');
    expect(lines).toContain('available at any time');
    expect(lines).toContain('Leave at least one rule');
  });

  it('admits the scan stopped, and at what number', () => {
    const lines = describeImpact(impactOf({ atLeast: true, scanLimit: 200 })).join(' ');
    expect(lines).toContain('first 200 bookings');
  });
});











