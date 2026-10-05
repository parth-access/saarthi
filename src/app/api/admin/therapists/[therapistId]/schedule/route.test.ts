import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { istDatePlusDays } from '@/shared/scheduling/slots';
import { checkRateLimit } from '../../../../_lib/rateLimit';
import { logger } from '../../../../_lib/logger';
import { ScheduleWriteRefusal } from './scheduleWriteSources';

/**
 * The HTTP edge of admin schedule management.
 *
 * `therapistScheduleWrite.test.ts` proves the domain rules in isolation. These
 * prove the route wires them to Firestore correctly, and that the specific ways
 * this endpoint could do harm are closed:
 *
 *  - a non-admin must never reach a read, let alone a write;
 *  - the change must be recorded against the session's uid, never the body's;
 *  - it must be unable to switch a therapist on or off — that is a different
 *    operation with a different blast radius;
 *  - a change with consequences must be answered with those consequences and
 *    **nothing written**, and the impact must be recomputed on the confirming
 *    request rather than trusted from the first;
 *  - a Firestore failure must reach the log and not the browser.
 *
 * The Firestore layer is mocked; `applyScheduleWrite` never being called is the
 * assertion that stands in for "nothing was written".
 */

const mocks = vi.hoisted(() => ({
  readSchedule: vi.fn(),
  scanBookings: vi.fn(),
  apply: vi.fn(),
}));

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('../../../../_lib/rateLimit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('../../../../_lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('./scheduleWriteSources', () => {
  // Defined here rather than imported so the route's `instanceof` check and this
  // file's constructor are the same class.
  class ScheduleWriteRefusal extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
      this.name = 'ScheduleWriteRefusal';
    }
  }
  return {
    ScheduleWriteRefusal,
    readScheduleForWrite: mocks.readSchedule,
    scanBookingsForImpact: mocks.scanBookings,
    applyScheduleWrite: mocks.apply,
    STRAND_NOTE_LIMIT: 25,
  };
});

const ADMIN = { uid: 'uid_admin', email: 'ops@saarthi.com', role: 'admin' };
const THERAPIST_ID = 'th_kavita';

/**
 * Dates are derived from the real clock rather than hard-coded, because the route
 * compares bookings against today in IST: a fixed date would start being read as
 * "already past" at some point after this was written.
 */
const FUTURE = istDatePlusDays(10);
const FUTURE_DOW = new Date(`${FUTURE}T00:00:00Z`).getUTCDay();
const OTHER_DOW = (FUTURE_DOW + 1) % 7;
/** A date with no bookings on it, for changes that should be uneventful. */
const QUIET_DAY = istDatePlusDays(20);

/** The stored schedule: one wide day, 09:00–17:00 at the practice's cadence. */
const WIDE_RULE = {
  id: 'rule_wide',
  dayOfWeek: FUTURE_DOW,
  isActive: true,
  startTime: '09:00',
  endTime: '17:00',
  slotDuration: 45,
  cooldownGap: 0,
  breaks: [],
};

function rulePayload(over: Record<string, unknown> = {}) {
  return {
    dayOfWeek: FUTURE_DOW,
    isActive: true,
    startTime: '09:00',
    endTime: '12:00',
    slotDuration: 45,
    cooldownGap: 0,
    breaks: [],
    ...over,
  };
}

function booking(over: Record<string, unknown> = {}) {
  return { id: 'bk_1', date: FUTURE, time: '14:15', status: 'confirmed', clientName: 'A. Rao', ...over };
}

function post(body: unknown, therapistId = THERAPIST_ID, raw?: string) {
  const req = new Request(`http://localhost/api/admin/therapists/${therapistId}/schedule`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: raw ?? JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ therapistId }) });
}

/** What "nothing was written" looks like from outside the Firestore layer. */
function nothingWritten() {
  expect(mocks.apply).not.toHaveBeenCalled();
}

/** The single argument `applyScheduleWrite` was handed, typed enough to assert on. */
function writeCall(): {
  therapistId: string;
  actorUid: string;
  change: Record<string, unknown>;
  impact: { stranded: { id: string }[] };
} {
  return mocks.apply.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 30, remaining: 29, reset: 0 });
  mocks.readSchedule.mockResolvedValue({
    therapistName: 'Kavita Menon',
    rules: [WIDE_RULE],
    overrides: [],
  });
  mocks.scanBookings.mockResolvedValue({ candidates: [], atLeast: false });
  mocks.apply.mockResolvedValue({ targetId: 'rule_wide', strandNotesWritten: 0 });
});

describe('authorization', () => {
  it('answers whatever requireAdmin decided, and reads nothing', async () => {
    for (const status of [401, 403]) {
      vi.clearAllMocks();
      vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'nope' }, { status }) as never);
      const res = await post({ action: 'delete_rule', ruleId: 'rule_wide' });
      expect(res.status).toBe(status);
      expect(mocks.readSchedule).not.toHaveBeenCalled();
      nothingWritten();
      // The limiter is keyed by IP, so consulting it before the gate would let
      // unauthenticated traffic exhaust the bucket a real operator needs.
      expect(checkRateLimit).not.toHaveBeenCalled();
    }
  });

  it('records the change against the verified session', async () => {
    await post({ action: 'save_override', override: { date: QUIET_DAY, type: 'blocked' } });
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(writeCall()).toMatchObject({ actorUid: 'uid_admin', therapistId: THERAPIST_ID });
  });

  it('refuses a body that tries to name its own actor', async () => {
    // `.strict()` means an identity claim cannot even be submitted, rather than
    // being accepted and then quietly ignored.
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide', adminUid: 'uid_someone_else' });
    expect(res.status).toBe(400);
    nothingWritten();
  });
});

describe('this endpoint changes hours and nothing else', () => {
  it('has no way to switch the therapist on or off', async () => {
    // `therapists/{id}.active` decides whether anyone can book them at all. Letting
    // it ride along here would make "I closed Tuesday" and "I made this therapist
    // unbookable" the same click.
    for (const body of [
      { action: 'delete_rule', ruleId: 'rule_wide', active: false },
      { action: 'save_rule', rule: { ...rulePayload(), active: false } },
      { action: 'save_rule', rule: rulePayload(), therapistActive: false },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    nothingWritten();
  });
});

describe('the therapist id', () => {
  it.each(['a/b', '..', '.', ''])('refuses %j without reading anything', async (id) => {
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide' }, id);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('That is not a valid therapist id.');
    expect(mocks.readSchedule).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('answers 404 when no therapist has that id', async () => {
    // Writing to `therapistAvailability/{id}/recurringRules` creates the parent path
    // implicitly, so a typo'd id would otherwise produce a schedule belonging to
    // nobody — invisible on the roster and impossible to find again.
    mocks.readSchedule.mockResolvedValue(null);
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('No therapist exists with that id.');
    nothingWritten();
  });
});

describe('rate limiting', () => {
  it('refuses a flood with 429, before any read', async () => {
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 30, remaining: 0, reset: 0 });
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide' });
    expect(res.status).toBe(429);
    expect(mocks.readSchedule).not.toHaveBeenCalled();
    nothingWritten();
  });
});

describe('what the endpoint accepts', () => {
  it('refuses a body that is not JSON', async () => {
    const res = await post(null, THERAPIST_ID, 'not json');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('The request body was not valid JSON.');
    nothingWritten();
  });

  it('refuses an action it does not implement', async () => {
    const res = await post({ action: 'delete_therapist' });
    expect(res.status).toBe(400);
    nothingWritten();
  });

  it('refuses a session length the practice does not run', async () => {
    const res = await post({ action: 'save_rule', rule: rulePayload({ slotDuration: 37 }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('30, 45, 60, 90');
    nothingWritten();
  });

  it('refuses an unpadded time', async () => {
    const res = await post({ action: 'save_rule', rule: rulePayload({ startTime: '9:00' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('zero-padded');
    nothingWritten();
  });

  it('logs a malformed request with the therapist and the admin', async () => {
    await post({ action: 'save_rule', rule: rulePayload({ dayOfWeek: 9 }) });
    expect(logger.warn).toHaveBeenCalledWith(
      'THERAPIST_MUTATION',
      expect.any(String),
      expect.objectContaining({ therapistId: THERAPIST_ID, adminUid: 'uid_admin' })
    );
  });
});

describe('the domain checks are wired in, not bypassed', () => {
  it('refuses a rule overlapping an active rule on the same weekday', async () => {
    const res = await post({ action: 'save_rule', rule: rulePayload({ startTime: '10:00', endTime: '11:30' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('overlaps an active rule already on this day');
    // Rejected before the booking scan, so a malformed request costs no reads.
    expect(mocks.scanBookings).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('lets an edit keep its own hours without conflicting with itself', async () => {
    const res = await post({
      action: 'save_rule',
      ruleId: 'rule_wide',
      rule: rulePayload({ startTime: '09:00', endTime: '17:00' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).applied).toBe(true);
  });

  it('refuses a window that fits no session', async () => {
    const res = await post({ action: 'save_rule', rule: rulePayload({ startTime: '09:00', endTime: '09:30' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('would offer nothing');
    nothingWritten();
  });

  it('refuses a second override on a date that already has one', async () => {
    mocks.readSchedule.mockResolvedValue({
      therapistName: 'Kavita Menon',
      rules: [WIDE_RULE],
      overrides: [
        {
          id: 'ov_1',
          date: QUIET_DAY,
          type: 'blocked',
          startTime: null,
          endTime: null,
          slotDuration: null,
          cooldownGap: null,
          breaks: [],
          reason: null,
        },
      ],
    });
    const res = await post({ action: 'save_override', override: { date: QUIET_DAY, type: 'available', startTime: '10:00', endTime: '13:00', slotDuration: 45, cooldownGap: 0 } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('already has an override');
    nothingWritten();
  });

  it('answers 404 when the rule to delete is already gone', async () => {
    const res = await post({ action: 'delete_rule', ruleId: 'rule_vanished' });
    expect(res.status).toBe(404);
    expect(mocks.scanBookings).not.toHaveBeenCalled();
    nothingWritten();
  });

  it('answers 404 when the override to delete is already gone', async () => {
    const res = await post({ action: 'delete_override', overrideId: 'ov_vanished' });
    expect(res.status).toBe(404);
    nothingWritten();
  });
});

describe('warn, then confirm', () => {
  /** Narrowing the wide day to 09:00–12:00 strands anything booked after 11:15. */
  const NARROWING = {
    action: 'save_rule',
    ruleId: 'rule_wide',
    rule: rulePayload({ startTime: '09:00', endTime: '12:00' }),
  };

  it('names the bookings a narrower day would leave behind, and writes nothing', async () => {
    mocks.scanBookings.mockResolvedValue({ candidates: [booking()], atLeast: false });
    const res = await post(NARROWING);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, applied: false });
    expect(body.impact.stranded).toEqual([
      { id: 'bk_1', date: FUTURE, time: '14:15', status: 'confirmed', clientName: 'A. Rao' },
    ]);
    // The operator is told the booking is untouched, because it is.
    expect(body.notes.join(' ')).toContain('rescheduling by hand');
    nothingWritten();
  });

  it('does not let a response carrying a client name be cached', async () => {
    mocks.scanBookings.mockResolvedValue({ candidates: [booking()], atLeast: false });
    const res = await post(NARROWING);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('recomputes the impact on the confirming request instead of trusting the first', async () => {
    mocks.scanBookings.mockResolvedValueOnce({ candidates: [booking()], atLeast: false });
    const first = await post(NARROWING);
    expect((await first.json()).impact.stranded).toHaveLength(1);
    nothingWritten();

    // A second booking lands in the seconds between the warning and the confirm.
    mocks.scanBookings.mockResolvedValueOnce({
      candidates: [booking(), booking({ id: 'bk_2', time: '15:45', clientName: 'S. Iyer' })],
      atLeast: false,
    });
    const second = await post({ ...NARROWING, acknowledgeImpact: true });
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body).toMatchObject({ applied: true, summary: 'Working hours updated.', targetId: 'rule_wide' });
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    // The set written into the audit entry is the one recomputed here, both of them.
    expect(writeCall().impact.stranded.map((b) => b.id)).toEqual(['bk_1', 'bk_2']);
  });

  it('applies a harmless change on the first request, with no confirmation step', async () => {
    const res = await post({
      action: 'save_override',
      override: { date: QUIET_DAY, type: 'blocked', reason: 'Conference' },
    });
    const body = await res.json();
    expect(body).toMatchObject({ applied: true, summary: `${QUIET_DAY} is now closed.` });
    expect(body.impact.needsConfirmation).toBe(false);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('treats a truncated booking scan as needing a person, even with nothing found', async () => {
    // A count presented as exact when it was truncated is worse than no count.
    mocks.scanBookings.mockResolvedValue({ candidates: [], atLeast: true });
    const res = await post(NARROWING);
    const body = await res.json();
    expect(body.applied).toBe(false);
    expect(body.impact.stranded).toEqual([]);
    expect(body.notes.join(' ')).toContain('there may be affected sessions this list does not show');
    nothingWritten();
  });
});

describe('removing the last of a therapist’s schedule', () => {
  it('warns that an empty schedule opens the therapist rather than closing them', async () => {
    // The booking validator counts raw documents and treats none as "available at
    // any time", so this is the opposite of what an operator would assume.
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide' });
    const body = await res.json();
    expect(body.applied).toBe(false);
    expect(body.impact.losesAllConfiguration).toBe(true);
    expect(body.notes.join(' ')).toContain('available at any time');
    nothingWritten();
  });

  it('applies that removal once it is acknowledged', async () => {
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide', acknowledgeImpact: true });
    expect((await res.json())).toMatchObject({ applied: true, summary: 'Working hours removed.' });
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(writeCall().impact).toMatchObject({ losesAllConfiguration: true });
  });
});

describe('cadence', () => {
  it('stores a 60-minute rule and states what it changed', async () => {
    // The practice runs 45 minutes. The choice is kept and the cost is stated —
    // a warning, never a block.
    const res = await post({
      action: 'save_rule',
      rule: rulePayload({ dayOfWeek: OTHER_DOW, slotDuration: 60, endTime: '17:00' }),
    });
    const body = await res.json();
    expect(body.applied).toBe(true);
    expect(body.warnings.join(' ')).toContain('not the 45-minute session');
    expect(writeCall().change).toMatchObject({ draft: { slotDuration: 60 } });
  });

  it('says nothing when the rule matches the 45-minute session', async () => {
    const res = await post({ action: 'save_rule', rule: rulePayload({ dayOfWeek: OTHER_DOW }) });
    expect((await res.json()).warnings).toEqual([]);
  });
});

describe('a closed day carries no hours', () => {
  it('drops times sent alongside a blocked override', async () => {
    // Otherwise a day that reads as closed would hold live-looking hours, and a
    // later edit flipping the type back would resurrect times nobody reviewed.
    await post({
      action: 'save_override',
      override: {
        date: QUIET_DAY,
        type: 'blocked',
        startTime: '10:00',
        endTime: '13:00',
        slotDuration: 90,
        cooldownGap: 15,
        breaks: [{ startTime: '11:00', endTime: '11:30' }],
      },
    });
    expect(writeCall().change).toMatchObject({
      draft: {
        type: 'blocked',
        startTime: null,
        endTime: null,
        slotDuration: null,
        cooldownGap: null,
        breaks: [],
      },
    });
  });
});

describe('when the write cannot go through', () => {
  const BLOCK_QUIET_DAY = { action: 'save_override', override: { date: QUIET_DAY, type: 'blocked' } };

  it('gives a transactional refusal its own status and its own sentence', async () => {
    // Another admin edited the same therapist mid-flight. That is the operator's
    // problem to resolve by reloading, not a server fault.
    mocks.apply.mockRejectedValue(
      new ScheduleWriteRefusal(409, 'Those working hours no longer exist — they were removed while this page was open.')
    );
    const res = await post(BLOCK_QUIET_DAY);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      error: 'Those working hours no longer exist — they were removed while this page was open.',
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps a Firestore failure out of the browser and in the log', async () => {
    mocks.readSchedule.mockRejectedValue(new Error('7 PERMISSION_DENIED: project saarthi-prod-9f21'));
    const res = await post({ action: 'delete_rule', ruleId: 'rule_wide' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(
      'The schedule could not be changed just now and nothing was written. The details are in the server log.'
    );
    expect(JSON.stringify(body)).not.toContain('saarthi-prod-9f21');
    expect(logger.error).toHaveBeenCalledWith(
      'THERAPIST_MUTATION',
      expect.any(String),
      expect.any(Error),
      expect.objectContaining({ therapistId: THERAPIST_ID, adminUid: 'uid_admin' })
    );
  });

  it('says nothing was written when the transaction itself fails', async () => {
    mocks.apply.mockRejectedValue(new Error('transaction closed'));
    const res = await post(BLOCK_QUIET_DAY);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('nothing was written');
  });
});
