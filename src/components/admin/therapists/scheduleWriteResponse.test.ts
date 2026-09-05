import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_SESSION_ERROR,
  SCHEDULE_UNKNOWN_OUTCOME,
  SCHEDULE_UNREADABLE_IMPACT,
  interpretScheduleWriteResponse,
} from './scheduleWriteResponse';

/**
 * Reading the schedule endpoint's answer.
 *
 * This endpoint has a property none of the other admin writes have: **two of its
 * successful answers are `200 { success: true }` and they mean opposite things.**
 * `applied: false` means nothing was written and a person must look at the impact
 * first; `applied: true` means the schedule has changed. Collapsing those two into
 * "it worked" is the specific bug this file exists to prevent, because the visible
 * symptom is an operator who believes a therapist's hours were changed when the
 * hours are untouched — and who therefore does not change them.
 *
 * The second thing asserted throughout: **which failures may be retried.** A
 * refusal wrote nothing, so resubmitting is safe. An unreadable answer might have
 * committed, so the only honest offer is a reload. A retry there is what applies a
 * schedule change twice.
 */

const IMPACT = {
  stranded: [
    { id: 'bk_1', date: '2026-09-14', time: '16:30', status: 'confirmed', clientName: 'A. Rao' },
  ],
  atLeast: false,
  scanLimit: 200,
  losesAllConfiguration: false,
  needsConfirmation: true,
};

describe('an answer that needs confirming', () => {
  it('is a confirm, not a success, and carries the rows to confirm against', () => {
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: false,
      impact: IMPACT,
      notes: ['1 booking sits outside the proposed hours.'],
      warnings: [],
    });
    expect(result).toEqual({
      kind: 'confirm',
      impact: IMPACT,
      notes: ['1 booking sits outside the proposed hours.'],
      warnings: [],
    });
  });

  it('keeps atLeast and scanLimit, which is what makes the count honest', () => {
    // The scan stops at its cap. An operator confirming against "3 bookings" when
    // the truth is "at least 3" is being shown a floor as if it were a total.
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: false,
      impact: { ...IMPACT, atLeast: true, scanLimit: 200 },
    });
    if (result.kind !== 'confirm') throw new Error(`expected confirm, got ${result.kind}`);
    expect(result.impact.atLeast).toBe(true);
    expect(result.impact.scanLimit).toBe(200);
  });

  it('carries losesAllConfiguration, the consequence that has no stranded rows at all', () => {
    // Deleting the last rule strands nobody and opens the therapist to every time
    // a client asks for. It must survive into the confirmation step.
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: false,
      impact: { ...IMPACT, stranded: [], losesAllConfiguration: true },
    });
    if (result.kind !== 'confirm') throw new Error(`expected confirm, got ${result.kind}`);
    expect(result.impact.losesAllConfiguration).toBe(true);
    expect(result.impact.stranded).toEqual([]);
  });

  it('refuses rather than confirms when the impact cannot be read', () => {
    // Nothing was written, so refusing outright is safe — and a confirmation step
    // that cannot show the list it exists to show must not be entered.
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: false,
      impact: { stranded: 'lots', atLeast: false, scanLimit: 200 },
    });
    expect(result).toEqual({ kind: 'refused', error: SCHEDULE_UNREADABLE_IMPACT });
  });

  it.each([
    ['a stranded row missing its id', { ...IMPACT, stranded: [{ date: '2026-09-14', time: '16:30', status: 'confirmed', clientName: null }] }],
    ['a stranded row with a numeric time', { ...IMPACT, stranded: [{ id: 'bk_1', date: '2026-09-14', time: 1630, status: 'confirmed', clientName: null }] }],
    ['a stranded row with an object clientName', { ...IMPACT, stranded: [{ id: 'bk_1', date: '2026-09-14', time: '16:30', status: 'confirmed', clientName: { first: 'A' } }] }],
    ['a non-boolean atLeast', { ...IMPACT, atLeast: 'yes' }],
    ['a missing scanLimit', { stranded: [], atLeast: false, losesAllConfiguration: false, needsConfirmation: true }],
    ['a non-finite scanLimit', { ...IMPACT, scanLimit: Number.NaN }],
    ['no impact at all', undefined],
  ])('rejects the whole payload when it contains %s', (_label, impact) => {
    // Whole-payload rejection, not per-row skipping: a stranded list quietly one
    // row short is worse than no list, because the operator confirms against it.
    const result = interpretScheduleWriteResponse(200, { success: true, applied: false, impact });
    expect(result).toEqual({ kind: 'refused', error: SCHEDULE_UNREADABLE_IMPACT });
  });

  it('accepts a stranded row whose client is genuinely unnamed', () => {
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: false,
      impact: { ...IMPACT, stranded: [{ id: 'bk_1', date: '2026-09-14', time: '16:30', status: 'pending', clientName: null }] },
    });
    if (result.kind !== 'confirm') throw new Error(`expected confirm, got ${result.kind}`);
    expect(result.impact.stranded[0]?.clientName).toBeNull();
  });
});

describe('an answer that applied', () => {
  it('reports the server summary and the count recomputed at write time', () => {
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: true,
      summary: 'Working hours updated.',
      notes: ['2 bookings now sit outside these hours and were left as they are.'],
      warnings: ['Sessions here will be 60 minutes, not the 45-minute session.'],
      impact: {
        ...IMPACT,
        stranded: [
          IMPACT.stranded[0],
          { id: 'bk_2', date: '2026-09-14', time: '16:45', status: 'confirmed', clientName: null },
        ],
      },
    });
    expect(result).toEqual({
      kind: 'applied',
      summary: 'Working hours updated.',
      notes: ['2 bookings now sit outside these hours and were left as they are.'],
      warnings: ['Sessions here will be 60 minutes, not the 45-minute session.'],
      strandedCount: 2,
    });
  });

  it('stays applied when the impact is unreadable, because the write already happened', () => {
    // The asymmetry with the `applied: false` case above is deliberate: telling an
    // operator a successful write failed is the worse error, and would send them
    // to retry a change that is already stored.
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: true,
      summary: 'Working hours updated.',
      impact: { stranded: [{ id: 42 }], atLeast: false, scanLimit: 200, losesAllConfiguration: false, needsConfirmation: false },
    });
    expect(result).toEqual({
      kind: 'applied',
      summary: 'Working hours updated.',
      notes: [],
      warnings: [],
      strandedCount: 0,
    });
  });

  it('is unknown when it cannot say what was applied', () => {
    // Applied with no usable summary: the state changed and the console cannot
    // describe it. Reload, don't retry.
    const result = interpretScheduleWriteResponse(200, { success: true, applied: true, summary: '' });
    expect(result).toEqual({ kind: 'unknown', error: SCHEDULE_UNKNOWN_OUTCOME });
  });

  it('drops non-string and empty entries from notes and warnings', () => {
    const result = interpretScheduleWriteResponse(200, {
      success: true,
      applied: true,
      summary: 'Date closed.',
      notes: ['A real note', '', null, 7, { text: 'nope' }],
      warnings: 'not an array',
    });
    if (result.kind !== 'applied') throw new Error(`expected applied, got ${result.kind}`);
    expect(result.notes).toEqual(['A real note']);
    expect(result.warnings).toEqual([]);
  });
});

describe('a refusal', () => {
  it.each([400, 404, 409, 422])('passes the server sentence through on %i', (status) => {
    // These are already operator-facing: the zod and domain 400s, the 404 for a
    // row that has gone, the 409 for a concurrent edit. A friendlier substitute
    // would lose the reason and with it the operator's next move.
    const result = interpretScheduleWriteResponse(status, {
      error: '09:00 – 09:30 fits no 45-minute session once the breaks and gap are taken out.',
    });
    expect(result).toEqual({
      kind: 'refused',
      error: '09:00 – 09:30 fits no 45-minute session once the breaks and gap are taken out.',
    });
  });

  it.each([401, 403])('explains the session on %i when the server sent nothing', (status) => {
    expect(interpretScheduleWriteResponse(status, {})).toEqual({
      kind: 'refused',
      error: SCHEDULE_SESSION_ERROR,
    });
  });

  it('prefers the server sentence on 403, which a signed-in non-admin also gets', () => {
    const result = interpretScheduleWriteResponse(403, { error: 'Admin access required.' });
    expect(result).toEqual({ kind: 'refused', error: 'Admin access required.' });
  });

  it('is safe to retry, which is the whole point of the split', () => {
    // A refusal wrote nothing. This is the property the UI reads to decide whether
    // to leave the form open with the draft intact.
    const result = interpretScheduleWriteResponse(400, { error: 'Pick a weekday.' });
    expect(result.kind).toBe('refused');
  });
});

describe('an outcome that is not known', () => {
  it('does not guess at a 500 with nothing readable in it', () => {
    // The fixed-sentence 500 arrives with an `error`, so a 5xx *without* one is a
    // failure the endpoint did not author — it could have committed before dying.
    expect(interpretScheduleWriteResponse(500, null)).toEqual({
      kind: 'unknown',
      error: SCHEDULE_UNKNOWN_OUTCOME,
    });
  });

  it('passes the endpoint own 500 sentence through as a refusal', () => {
    // The route's catch-all answers a fixed sentence after logging; it is written
    // for an operator and says the schedule was not changed.
    const result = interpretScheduleWriteResponse(500, {
      error: 'The schedule could not be changed. Nothing was saved. Try again in a moment.',
    });
    expect(result.kind).toBe('refused');
  });

  it.each([
    ['a 2xx that is not an object', 'OK'],
    ['a 2xx with success false', { success: false, applied: true, summary: 'x' }],
    ['a 2xx with no applied flag', { success: true, summary: 'Working hours updated.' }],
    ['a 2xx whose applied flag is a string', { success: true, applied: 'true', summary: 'x' }],
    ['a 204 with no body', null],
  ])('treats %s as unknown', (_label, body) => {
    expect(interpretScheduleWriteResponse(200, body)).toEqual({
      kind: 'unknown',
      error: SCHEDULE_UNKNOWN_OUTCOME,
    });
  });

  it('tells the operator to reload and not to retry', () => {
    // Asserted on the copy itself: this sentence is the only thing standing
    // between an indeterminate write and a double-applied schedule change.
    expect(SCHEDULE_UNKNOWN_OUTCOME).toContain('do not retry');
    expect(SCHEDULE_UNKNOWN_OUTCOME).toContain('Reload');
  });
});
