import { describe, expect, it } from 'vitest';
import {
  GENERIC_THERAPISTS_ERROR,
  THERAPISTS_ACCESS_ERROR,
  interpretAdminTherapistDetailResponse,
  interpretAdminTherapistsResponse,
} from './adminTherapistsResponse';

/**
 * The gate between the therapist endpoints and the screen. The bookable grid is
 * computed in the browser from the rules these return, so a malformed rule is the
 * failure that matters: one non-weekday `dayOfWeek` or non-numeric duration would
 * corrupt the weekly view. A missing scan is refused too — a truncated body must
 * never read as "no therapists" or "no hours". These are the refusals.
 */

function scheduleRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule_1',
    dayOfWeek: 3,
    isActive: true,
    startTime: '09:00',
    endTime: '17:00',
    slotDuration: 45,
    cooldownGap: 0,
    breaks: [{ startTime: '11:30', endTime: '13:00' }],
    ...overrides,
  };
}

function scheduleOverride(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ov_1',
    date: '2026-09-20',
    type: 'blocked',
    startTime: null,
    endTime: null,
    slotDuration: null,
    cooldownGap: null,
    breaks: [],
    reason: 'Leave',
    ...overrides,
  };
}

function rosterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Dr. Rao',
    specialization: 'Anxiety',
    active: true,
    email: 'rao@example.com',
    summary: { openDays: 5, hasCadenceDrift: false, hasInactiveRule: false },
    ...overrides,
  };
}

function rosterBody(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    generatedAtIso: '2026-09-05T09:00:00.000Z',
    roster: { ok: true, rows: [rosterRow()] },
    ...overrides,
  };
}

function detailBody(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    generatedAtIso: '2026-09-05T09:00:00.000Z',
    therapist: {
      id: 't1',
      name: 'Dr. Rao',
      specialization: 'Anxiety',
      experience: '10 years',
      bio: 'Bio',
      active: true,
      email: 'rao@example.com',
    },
    rules: { ok: true, rows: [scheduleRule()], unreadable: 0 },
    overrides: { ok: true, rows: [scheduleOverride()], unreadable: 0 },
    ...overrides,
  };
}

describe('interpretAdminTherapistsResponse — roster', () => {
  it('reads 401 and 403 as a session that lost admin access', () => {
    expect(interpretAdminTherapistsResponse(401, null)).toEqual({ ok: false, error: THERAPISTS_ACCESS_ERROR });
    expect(interpretAdminTherapistsResponse(403, null)).toEqual({ ok: false, error: THERAPISTS_ACCESS_ERROR });
  });

  it("lets the server's own sentence through on a 5xx", () => {
    const result = interpretAdminTherapistsResponse(500, { error: 'Roster is down.' });
    expect(result).toEqual({ ok: false, error: 'Roster is down.' });
  });

  it('falls back to the generic error when a failure carries no sentence', () => {
    expect(interpretAdminTherapistsResponse(503, {})).toEqual({ ok: false, error: GENERIC_THERAPISTS_ERROR });
  });

  it('treats a 200 that admits success:false as a failure', () => {
    const result = interpretAdminTherapistsResponse(200, rosterBody({ success: false, error: 'nope' }));
    expect(result).toEqual({ ok: false, error: 'nope' });
  });

  it('rejects a body with no roster scan', () => {
    const { roster, ...withoutRoster } = rosterBody();
    void roster;
    expect(interpretAdminTherapistsResponse(200, withoutRoster).ok).toBe(false);
  });

  it('accepts an admitted roster failure as data', () => {
    const result = interpretAdminTherapistsResponse(200, rosterBody({ roster: { ok: false, reason: 'Down.' } }));
    expect(result.ok).toBe(true);
  });

  it('accepts an empty roster and a row whose summary could not be read', () => {
    expect(interpretAdminTherapistsResponse(200, rosterBody({ roster: { ok: true, rows: [] } })).ok).toBe(true);
    const nullSummary = rosterBody({ roster: { ok: true, rows: [rosterRow({ summary: null })] } });
    expect(interpretAdminTherapistsResponse(200, nullSummary).ok).toBe(true);
  });

  it('rejects a roster row with a non-boolean active or a malformed summary', () => {
    const badActive = rosterBody({ roster: { ok: true, rows: [rosterRow({ active: 'yes' })] } });
    expect(interpretAdminTherapistsResponse(200, badActive).ok).toBe(false);
    const badSummary = rosterBody({ roster: { ok: true, rows: [rosterRow({ summary: { openDays: 'five' } })] } });
    expect(interpretAdminTherapistsResponse(200, badSummary).ok).toBe(false);
  });
});

describe('interpretAdminTherapistDetailResponse — one therapist', () => {
  it('accepts a fully-populated detail', () => {
    const result = interpretAdminTherapistDetailResponse(200, detailBody());
    expect(result.ok).toBe(true);
  });

  it('rejects a detail missing the therapist, rules, or overrides', () => {
    for (const key of ['therapist', 'rules', 'overrides']) {
      const body = detailBody();
      delete (body as Record<string, unknown>)[key];
      expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(false);
    }
  });

  it('rejects a rule whose dayOfWeek is not a weekday', () => {
    const body = detailBody({ rules: { ok: true, rows: [scheduleRule({ dayOfWeek: 7 })], unreadable: 0 } });
    expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(false);
  });

  it('rejects a rule with a non-numeric duration rather than previewing NaN', () => {
    const body = detailBody({ rules: { ok: true, rows: [scheduleRule({ slotDuration: 'long' })], unreadable: 0 } });
    expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(false);
  });

  it('requires the unreadable count on a successful scan', () => {
    const body = detailBody({ rules: { ok: true, rows: [scheduleRule()] } });
    expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(false);
  });

  it('accepts an admitted rule-scan failure while the rest loads', () => {
    const body = detailBody({ rules: { ok: false, reason: 'Rules could not be read.' } });
    expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(true);
  });

  it('rejects an override with an unknown type', () => {
    const body = detailBody({ overrides: { ok: true, rows: [scheduleOverride({ type: 'maybe' })], unreadable: 0 } });
    expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(false);
  });

  it('rejects an identity that has lost a field', () => {
    const body = detailBody();
    delete (body.therapist as Record<string, unknown>).active;
    expect(interpretAdminTherapistDetailResponse(200, body).ok).toBe(false);
  });
});
