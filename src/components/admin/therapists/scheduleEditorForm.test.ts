import { describe, it, expect } from 'vitest';
import {
  blankOverrideForm,
  blankRuleForm,
  checkOverrideForm,
  checkRuleForm,
  formCadenceWarning,
  overrideFormFrom,
  previewSlots,
  ruleFormFrom,
  ruleFormIsUnchanged,
  SLOT_CHOICES,
} from './scheduleEditorForm';
import { ALLOWED_SLOT_MINUTES } from '@/domains/admin/therapistScheduleWrite';
import type { AdminScheduleOverride, AdminScheduleRule } from '@/domains/admin/therapistSchedule';

/**
 * The schedule editor's form state.
 *
 * A form holds strings; the endpoint takes numbers and refuses the ones that mean
 * nothing. Two failures are specifically guarded here:
 *
 *  - **`Number('')` is 0.** An untouched session-length select coerced to a number
 *    is a rule that offers no start times at all — storable in Firestore, invisible
 *    to clients, and indistinguishable from a working day on the roster.
 *  - **A local check that is not the server's check.** Every rejection below comes
 *    from the same `checkRuleDraft`/`checkOverrideDraft` the endpoint runs, against
 *    the same stored rows it reads. The tests assert the server's own sentences,
 *    which is what proves the editor cannot start accepting what the server
 *    refuses, or refusing what is legitimate.
 */

const MONDAY = 1;

const RULE: AdminScheduleRule = {
  id: 'rule_mon',
  dayOfWeek: MONDAY,
  isActive: true,
  startTime: '09:00',
  endTime: '17:00',
  slotDuration: 45,
  cooldownGap: 0,
  breaks: [],
};

const OVERRIDE: AdminScheduleOverride = {
  id: 'ovr_1',
  date: '2026-09-21',
  type: 'available',
  startTime: '10:00',
  endTime: '14:00',
  slotDuration: 45,
  cooldownGap: 0,
  breaks: [{ startTime: '12:00', endTime: '12:30' }],
  reason: 'Clinic day',
};

describe('what the editor opens with', () => {
  it('offers exactly the lengths the server accepts', () => {
    // The select is built from this list. A fifth option here would be an option
    // the server rejects after the operator has filled the rest of the form in.
    expect(SLOT_CHOICES).toEqual(ALLOWED_SLOT_MINUTES);
  });

  it('pre-fills a new rule with the practice cadence, so the default warns about nothing', () => {
    const form = blankRuleForm(MONDAY);
    expect(form).toEqual({
      ruleId: null,
      dayOfWeek: MONDAY,
      isActive: true,
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: '45',
      cooldownGap: '0',
      breaks: [],
    });
    expect(formCadenceWarning(form)).toBeNull();
  });

  it('opens a new override closed, which removes slots rather than inventing them', () => {
    const form = blankOverrideForm('2026-09-21');
    expect(form.type).toBe('blocked');
    expect(form.overrideId).toBeNull();
    expect(form.reason).toBe('');
  });

  it('round-trips a stored rule without changing it', () => {
    const form = ruleFormFrom({ ...RULE, breaks: [{ startTime: '13:00', endTime: '13:30' }] });
    expect(form.ruleId).toBe('rule_mon');
    expect(form.slotDuration).toBe('45');
    expect(form.cooldownGap).toBe('0');
    expect(form.breaks).toEqual([{ startTime: '13:00', endTime: '13:30' }]);
    expect(ruleFormIsUnchanged(form, { ...RULE, breaks: [{ startTime: '13:00', endTime: '13:30' }] })).toBe(true);
  });
});

describe('a stored value the console does not offer', () => {
  it('presents an unsupported session length as unset, so it cannot be saved back unread', () => {
    // A rule already holding 37 minutes is wrong now. Showing it as a fifth select
    // option would let an operator save the wrong value back without ever seeing it.
    const form = ruleFormFrom({ ...RULE, slotDuration: 37 });
    expect(form.slotDuration).toBe('');

    const check = checkRuleForm(form, []);
    if (check.ok) throw new Error('expected the unset length to be refused');
    expect(check.problem).toContain('30, 45, 60, 90');
  });

  it('presents an override with no stored length as unset, naming the 60-minute fallback', () => {
    // The booking flow reads `slotDuration || 60` for an override. Left unset, the
    // day silently becomes 60-minute sessions — so the operator is made to choose.
    const form = overrideFormFrom({ ...OVERRIDE, slotDuration: null });
    expect(form.slotDuration).toBe('');

    const check = checkOverrideForm(form, []);
    if (check.ok) throw new Error('expected the unset length to be refused');
    expect(check.problem).toContain('60-minute');
  });

  it('reads a missing cooldown as no gap rather than as nothing typed', () => {
    expect(ruleFormFrom({ ...RULE, cooldownGap: Number.NaN }).cooldownGap).toBe('0');
    expect(overrideFormFrom({ ...OVERRIDE, cooldownGap: null }).cooldownGap).toBe('0');
  });

  it('fills the hour fields of a closed override so switching it to open is editable', () => {
    const form = overrideFormFrom({
      ...OVERRIDE,
      type: 'blocked',
      startTime: null,
      endTime: null,
      slotDuration: null,
      cooldownGap: null,
      reason: null,
    });
    expect(form).toMatchObject({ type: 'blocked', startTime: '09:00', endTime: '17:00', reason: '' });
  });
});

describe('turning strings into a draft', () => {
  it('refuses an untouched select instead of sending 0', () => {
    // The bug this exists for: `Number('')` is 0, zod would take it, and the stored
    // rule would offer no start times.
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), slotDuration: '' }, []);
    if (check.ok) throw new Error('expected an empty select to be refused');
    expect(check.problem).toBe('Choose a session length: 30, 45, 60, 90 minutes.');
  });

  it.each([
    ['an empty gap', ''],
    ['a negative gap', '-15'],
    ['a decimal gap', '7.5'],
    ['a word', 'none'],
    ['a number with a stray character', '15m'],
  ])('refuses %s rather than coercing it', (_label, cooldownGap) => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), cooldownGap }, []);
    if (check.ok) throw new Error('expected the gap to be refused');
    expect(check.problem).toContain('whole number of minutes');
  });

  it('trims the times before they are checked or stored', () => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime: ' 09:00 ', endTime: '17:00 ' }, []);
    if (!check.ok) throw new Error(`expected ok, got: ${check.problem}`);
    expect(check.draft.startTime).toBe('09:00');
    expect(check.draft.endTime).toBe('17:00');
  });

  it('drops a break row the operator added but has not typed into', () => {
    const check = checkRuleForm(
      { ...blankRuleForm(MONDAY), breaks: [{ startTime: '13:00', endTime: '13:30' }, { startTime: '', endTime: '  ' }] },
      []
    );
    if (!check.ok) throw new Error(`expected ok, got: ${check.problem}`);
    expect(check.draft.breaks).toEqual([{ startTime: '13:00', endTime: '13:30' }]);
  });

  it('passes a half-filled break through so the domain names it', () => {
    // Silently dropping this row would store a schedule missing a break the
    // operator believes they entered.
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), breaks: [{ startTime: '13:00', endTime: '' }] }, []);
    if (check.ok) throw new Error('expected the half-filled break to be refused');
    expect(check.problem).toBe('Every break needs a zero-padded 24-hour start and end.');
  });
});

describe('the local check is the server check', () => {
  it('refuses a rule that overlaps another active rule on the same day', () => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime: '16:00', endTime: '19:00' }, [RULE]);
    if (check.ok) throw new Error('expected the overlap to be refused');
    expect(check.problem).toContain('overlaps an active rule already on this day');
    expect(check.problem).toContain('09:00 – 17:00');
  });

  it('lets a rule keep its own hours, because it excludes itself by id', () => {
    // Without the id, editing only the break of a stored rule would report the rule
    // as overlapping itself and nothing could ever be edited.
    const form = ruleFormFrom(RULE);
    const check = checkRuleForm({ ...form, breaks: [{ startTime: '13:00', endTime: '13:45' }] }, [RULE]);
    expect(check.ok).toBe(true);
  });

  it('allows a second window on the same day when it starts after the first ends', () => {
    const check = checkRuleForm(
      { ...blankRuleForm(MONDAY), startTime: '17:00', endTime: '20:00' },
      [RULE]
    );
    expect(check.ok).toBe(true);
  });

  it('ignores an inactive rule when checking for an overlap', () => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime: '10:00', endTime: '12:00' }, [
      { ...RULE, isActive: false },
    ]);
    expect(check.ok).toBe(true);
  });

  it('refuses a window that fits no session, which would be an invisible closed day', () => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime: '09:00', endTime: '09:30' }, []);
    if (check.ok) throw new Error('expected the empty window to be refused');
    expect(check.problem).toContain('would offer nothing');
  });

  it('refuses an end that is not after the start', () => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime: '17:00', endTime: '09:00' }, []);
    if (check.ok) throw new Error('expected the inverted window to be refused');
    expect(check.problem).toBe('The end time must be later than the start time.');
  });

  it('refuses an unpadded time, the format the rest of the platform assumes', () => {
    const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime: '9:00' }, []);
    if (check.ok) throw new Error('expected the unpadded time to be refused');
    expect(check.problem).toContain('zero-padded');
  });
});

describe('a closed date carries no hours', () => {
  it('drops whatever is in the hour fields, so the check runs on what will be stored', () => {
    // The operator may have typed hours, switched the day to closed, and submitted.
    // Sending those hours for the server to discard would mean the local check ran
    // against a draft that never existed.
    const check = checkOverrideForm(
      {
        ...blankOverrideForm('2026-09-21'),
        type: 'blocked',
        startTime: '99:99',
        endTime: '',
        slotDuration: '',
        cooldownGap: 'nonsense',
        breaks: [{ startTime: 'x', endTime: 'y' }],
        reason: '  Therapist on leave  ',
      },
      []
    );
    if (!check.ok) throw new Error(`expected ok, got: ${check.problem}`);
    expect(check.draft).toEqual({
      date: '2026-09-21',
      type: 'blocked',
      startTime: null,
      endTime: null,
      slotDuration: null,
      cooldownGap: null,
      breaks: [],
      reason: 'Therapist on leave',
    });
  });

  it('stores no reason rather than an empty one', () => {
    const check = checkOverrideForm({ ...blankOverrideForm('2026-09-21'), reason: '   ' }, []);
    if (!check.ok) throw new Error(`expected ok, got: ${check.problem}`);
    expect(check.draft.reason).toBeNull();
  });

  it('warns about nothing, because a closed day has no cadence', () => {
    const form = { ...blankOverrideForm('2026-09-21'), slotDuration: '90', cooldownGap: '15' };
    expect(formCadenceWarning(form)).toBeNull();
    expect(previewSlots(form)).toEqual([]);
  });
});

describe('one override per date', () => {
  it('refuses a second override on a date that already has one', () => {
    // Both readers resolve a same-date collision with `.find()` over an unordered
    // fetch, so which one wins is auto-id ordering — not something an operator sees.
    const check = checkOverrideForm({ ...blankOverrideForm('2026-09-21'), type: 'blocked' }, [OVERRIDE]);
    if (check.ok) throw new Error('expected the duplicate date to be refused');
    expect(check.problem).toContain('already has an override');
  });

  it('lets the stored override keep its own date', () => {
    const form = overrideFormFrom(OVERRIDE);
    const check = checkOverrideForm({ ...form, reason: 'Clinic day (moved)' }, [OVERRIDE]);
    expect(check.ok).toBe(true);
  });

  it('refuses an impossible calendar date that every regex here accepts', () => {
    const check = checkOverrideForm({ ...blankOverrideForm('2026-02-30'), type: 'blocked' }, []);
    if (check.ok) throw new Error('expected the impossible date to be refused');
    expect(check.problem).toBe('Give a real date as YYYY-MM-DD.');
  });
});

describe('the cadence note', () => {
  it('says nothing at the practice cadence', () => {
    expect(formCadenceWarning(blankRuleForm(MONDAY))).toBeNull();
  });

  it('names the divergence without blocking it', () => {
    // The user-chosen policy: keep the 30/45/60/90 choice, state what it costs.
    const note = formCadenceWarning({ ...blankRuleForm(MONDAY), slotDuration: '60' });
    expect(note).toContain('60 minutes');
    expect(note).toContain('45-minute session');

    const check = checkRuleForm({ ...blankRuleForm(MONDAY), slotDuration: '60' }, []);
    if (!check.ok) throw new Error(`expected 60 to be storable, got: ${check.problem}`);
    expect(check.warnings).toEqual([note]);
  });

  it('names a gap the standard does not have', () => {
    expect(formCadenceWarning({ ...blankRuleForm(MONDAY), cooldownGap: '15' })).toContain('15-minute gap');
  });

  it('says nothing while the fields are still incomplete', () => {
    expect(formCadenceWarning({ ...blankRuleForm(MONDAY), slotDuration: '' })).toBeNull();
  });
});

describe('the start times a draft would offer', () => {
  it('shows the real grid, generated by the function the booking page calls', () => {
    // 09:00–17:00 at 45/0 ends at 15:45, not 16:15: a slot is only emitted when the
    // whole session fits before the end time. An operator reading "until 17:00" and
    // a client seeing a last start of 15:45 is exactly the surprise this removes.
    expect(previewSlots(blankRuleForm(MONDAY))).toEqual([
      '09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '15:00', '15:45',
    ]);
  });

  it('steps past a break rather than colliding with it', () => {
    const slots = previewSlots({
      ...blankRuleForm(MONDAY),
      endTime: '13:00',
      breaks: [{ startTime: '10:00', endTime: '11:00' }],
    });
    expect(slots).toEqual(['09:00', '11:00', '11:45']);
  });

  it('widens the grid when the gap is removed and narrows it when one is added', () => {
    const withGap = previewSlots({ ...blankRuleForm(MONDAY), endTime: '12:00', cooldownGap: '15' });
    expect(withGap).toEqual(['09:00', '10:00', '11:00']);
    expect(previewSlots({ ...blankRuleForm(MONDAY), endTime: '12:00' })).toEqual([
      '09:00', '09:45', '10:30', '11:15',
    ]);
  });

  it('shows the override grid, breaks included', () => {
    expect(previewSlots(overrideFormFrom(OVERRIDE))).toEqual(['10:00', '10:45', '12:30', '13:15']);
  });

  it.each([
    ['no session length chosen', { slotDuration: '' }],
    ['an unparseable gap', { cooldownGap: 'none' }],
    ['an inverted window', { startTime: '17:00', endTime: '09:00' }],
    ['a window shorter than one session', { startTime: '09:00', endTime: '09:30' }],
  ])('is empty with %s, which is the same answer a client would get', (_label, patch) => {
    expect(previewSlots({ ...blankRuleForm(MONDAY), ...patch })).toEqual([]);
  });

  it.each(['9:00', '09:0', '25:00', '09:60', ''])(
    'is empty for the unstorable time %j, instead of drawing a grid the check refuses',
    (startTime) => {
      // `timeToMinutes` reads '9:00' as 540 and '25:00' as past midnight, so the
      // generator alone would happily produce a full day. A preview that renders
      // one teaches an operator that an unpadded time works, and the save then
      // contradicts it.
      expect(previewSlots({ ...blankRuleForm(MONDAY), startTime })).toEqual([]);
      const check = checkRuleForm({ ...blankRuleForm(MONDAY), startTime }, []);
      expect(check.ok).toBe(false);
    }
  );

  it('does not let a preview mutate the form breaks', () => {
    // `generateTimeSlots` takes a mutable array; handing it the form's own would let
    // a render change the draft.
    const form = { ...blankRuleForm(MONDAY), breaks: [{ startTime: '13:00', endTime: '13:30' }] };
    previewSlots(form);
    expect(form.breaks).toEqual([{ startTime: '13:00', endTime: '13:30' }]);
  });
});

describe('whether an edit would change anything', () => {
  it('is true for a form nobody touched', () => {
    expect(ruleFormIsUnchanged(ruleFormFrom(RULE), RULE)).toBe(true);
  });

  it.each([
    ['the day', { dayOfWeek: 2 }],
    ['the active flag', { isActive: false }],
    ['the start', { startTime: '08:00' }],
    ['the end', { endTime: '18:00' }],
    ['the session length', { slotDuration: '60' }],
    ['the gap', { cooldownGap: '15' }],
    ['the breaks', { breaks: [{ startTime: '13:00', endTime: '13:30' }] }],
  ])('is false once %s differs', (_label, patch) => {
    expect(ruleFormIsUnchanged({ ...ruleFormFrom(RULE), ...patch }, RULE)).toBe(false);
  });

  it('notices a break whose times moved without its count changing', () => {
    const stored = { ...RULE, breaks: [{ startTime: '13:00', endTime: '13:30' }] };
    const form = { ...ruleFormFrom(stored), breaks: [{ startTime: '13:15', endTime: '13:45' }] };
    expect(ruleFormIsUnchanged(form, stored)).toBe(false);
  });

  it('is false for a new rule, which always changes something', () => {
    expect(ruleFormIsUnchanged(blankRuleForm(MONDAY), null)).toBe(false);
  });

  it('is false for a form that does not parse, so the operator sees the real problem', () => {
    // Reporting "nothing to save" for an invalid draft would hide the reason it is
    // invalid behind a disabled button.
    expect(ruleFormIsUnchanged({ ...ruleFormFrom(RULE), slotDuration: '' }, RULE)).toBe(false);
  });

  it('treats whitespace-only edits as no change, since the draft is trimmed', () => {
    expect(ruleFormIsUnchanged({ ...ruleFormFrom(RULE), startTime: ' 09:00 ' }, RULE)).toBe(true);
  });
});
