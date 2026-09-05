import { describe, it, expect } from 'vitest';
import {
  GENERIC_OVERVIEW_ERROR,
  OVERVIEW_ACCESS_ERROR,
  describeOverviewGaps,
  interpretAdminOverviewResponse,
  type AdminOverviewPayload,
} from './adminOverviewResponse';
import { ATTENTION_QUEUES, type BoundedCount } from '@/domains/admin/overviewTriage';

/**
 * What the overview is allowed to render.
 *
 * The tests that matter here are the refusals. This page is where an operator
 * decides there is nothing to do, so the failure that costs money is not a blank
 * screen — it is five queues at zero and a sixth that quietly went missing.
 */

const ok = (count: number, atLeast = false): BoundedCount => ({ ok: true, count, atLeast });
const unreadable: BoundedCount = { ok: false, reason: 'Could not be read just now.' };

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    success: true,
    generatedAtIso: '2026-09-05T09:00:00.000Z',
    istDate: '2026-09-05',
    attention: {
      awaiting_approval: ok(2),
      lapsed_holds: ok(0),
      missing_meet_link: ok(0),
      refunds_outstanding: ok(1),
      events_abandoned: ok(0),
      emails_failed: ok(0),
    },
    notes: { lapsed_holds: null },
    today: { ok: true, sessions: [], other: [], atLeast: false },
    machinery: { waiting: ok(3), dead: ok(0), sample: [] },
    scanLimit: 60,
    ...overrides,
  };
}

function accepted(overrides: Record<string, unknown> = {}): AdminOverviewPayload {
  const result = interpretAdminOverviewResponse(200, body(overrides));
  if (!result.ok) throw new Error(`expected an accepted payload, got: ${result.error}`);
  return result.payload;
}

describe('interpretAdminOverviewResponse — transport', () => {
  it('names the access problem for 401 and 403 rather than blaming the server', () => {
    expect(interpretAdminOverviewResponse(401, null)).toEqual({
      ok: false,
      error: OVERVIEW_ACCESS_ERROR,
    });
    expect(interpretAdminOverviewResponse(403, { error: 'Forbidden: Admin role required' })).toEqual(
      { ok: false, error: OVERVIEW_ACCESS_ERROR }
    );
  });

  it("shows the route's own sentence for a 500", () => {
    const result = interpretAdminOverviewResponse(500, {
      success: false,
      error: 'We could not load the overview right now. Please try again.',
    });
    expect(result).toEqual({
      ok: false,
      error: 'We could not load the overview right now. Please try again.',
    });
  });

  it('falls back to generic copy when a failure carries no usable message', () => {
    expect(interpretAdminOverviewResponse(502, null).ok).toBe(false);
    expect(interpretAdminOverviewResponse(502, null)).toEqual({
      ok: false,
      error: GENERIC_OVERVIEW_ERROR,
    });
    expect(interpretAdminOverviewResponse(500, { error: '   ' })).toEqual({
      ok: false,
      error: GENERIC_OVERVIEW_ERROR,
    });
  });

  it('treats a 200 that says it failed as a failure', () => {
    // Otherwise the error body's absent fields would render as an empty day.
    expect(interpretAdminOverviewResponse(200, { success: false, error: 'Nope.' })).toEqual({
      ok: false,
      error: 'Nope.',
    });
  });

  it('refuses a body that was not JSON at all', () => {
    expect(interpretAdminOverviewResponse(200, null).ok).toBe(false);
    expect(interpretAdminOverviewResponse(200, 'gateway timeout').ok).toBe(false);
  });
});

describe('interpretAdminOverviewResponse — refusing a partial payload', () => {
  it.each(ATTENTION_QUEUES.map((queue) => queue.id))(
    'refuses the whole payload when the %s queue is absent',
    (id) => {
      const attention = { ...(body().attention as Record<string, unknown>) };
      delete attention[id];

      const result = interpretAdminOverviewResponse(200, body({ attention }));

      // A missing queue must never reach the screen, where an undefined count
      // would render beside five zeroes and read as "all clear".
      expect(result).toEqual({ ok: false, error: GENERIC_OVERVIEW_ERROR });
    }
  );

  it('refuses a count that claims success without saying whether it was capped', () => {
    const attention = {
      ...(body().attention as Record<string, unknown>),
      awaiting_approval: { ok: true, count: 60 },
    };
    // Without `atLeast`, "60 or more" would be displayed as exactly 60.
    expect(interpretAdminOverviewResponse(200, body({ attention })).ok).toBe(false);
  });

  it('refuses a failed count with no reason to show', () => {
    const attention = {
      ...(body().attention as Record<string, unknown>),
      emails_failed: { ok: false, reason: '' },
    };
    expect(interpretAdminOverviewResponse(200, body({ attention })).ok).toBe(false);
  });

  it('refuses a count that is neither a success nor an admitted failure', () => {
    for (const broken of [null, 4, 'two', {}, { ok: 'yes', count: 1, atLeast: false }]) {
      const attention = { ...(body().attention as Record<string, unknown>), lapsed_holds: broken };
      expect(interpretAdminOverviewResponse(200, body({ attention })).ok).toBe(false);
    }
  });

  it.each([
    ['today', undefined],
    ['today', { ok: true, sessions: [] }],
    ['today', { ok: false, reason: '' }],
    ['machinery', { waiting: ok(1), dead: ok(0) }],
    ['machinery', { waiting: ok(1), dead: ok(0), sample: [{ status: 'pending' }] }],
    ['notes', undefined],
    ['notes', { lapsed_holds: 7 }],
    ['scanLimit', '60'],
    ['istDate', undefined],
    ['generatedAtIso', 1757062800000],
  ])('refuses a payload whose %s is malformed', (key, value) => {
    const overrides = body();
    if (value === undefined) delete overrides[key];
    else overrides[key] = value;

    expect(interpretAdminOverviewResponse(200, overrides).ok).toBe(false);
  });

  it('accepts a sample event whose timestamps are missing', () => {
    // Null timestamps are a real state — an outbox document written before the
    // field existed — and the machinery reading already handles them.
    const payload = accepted({
      machinery: {
        waiting: ok(1),
        dead: ok(0),
        sample: [{ createdAtIso: null, nextAttemptAtIso: null, status: 'pending' }],
      },
    });
    expect(payload.machinery.sample).toHaveLength(1);
  });
});

describe('interpretAdminOverviewResponse — what it passes through', () => {
  it('keeps every field the screen reads', () => {
    const payload = accepted();

    expect(payload.istDate).toBe('2026-09-05');
    expect(payload.generatedAtIso).toBe('2026-09-05T09:00:00.000Z');
    expect(payload.scanLimit).toBe(60);
    expect(payload.attention.awaiting_approval).toEqual(ok(2));
    expect(payload.machinery.waiting).toEqual(ok(3));
  });

  it('carries an admitted failure through as a failure, not as a zero', () => {
    const attention = {
      ...(body().attention as Record<string, unknown>),
      refunds_outstanding: unreadable,
    };
    const payload = accepted({ attention });

    expect(payload.attention.refunds_outstanding).toEqual(unreadable);
    expect(payload.attention.refunds_outstanding.ok).toBe(false);
  });

  it('accepts a day that could not be read', () => {
    const payload = accepted({ today: { ok: false, reason: 'Could not be read just now.' } });
    expect(payload.today.ok).toBe(false);
  });

  it('carries the lapsed-hold note when there is one', () => {
    const payload = accepted({ notes: { lapsed_holds: 'Hold lapsed 1 hr 35 min ago' } });
    expect(payload.notes.lapsed_holds).toBe('Hold lapsed 1 hr 35 min ago');
  });
});

describe('describeOverviewGaps', () => {
  it('says nothing when every source answered', () => {
    expect(describeOverviewGaps(accepted())).toBeNull();
  });

  it('names a single missing reading and calls it missing, not zero', () => {
    const attention = { ...(body().attention as Record<string, unknown>), emails_failed: unreadable };
    const gaps = describeOverviewGaps(accepted({ attention }));

    expect(gaps?.labels).toEqual(['Emails that failed to send']);
    expect(gaps?.sentence).toContain('1 reading could not be loaded');
    expect(gaps?.sentence).toContain('missing, not zero');
  });

  it('lists several gaps in the order the page presents them', () => {
    const attention = {
      ...(body().attention as Record<string, unknown>),
      awaiting_approval: unreadable,
      refunds_outstanding: unreadable,
    };
    const gaps = describeOverviewGaps(
      accepted({ attention, today: { ok: false, reason: 'Could not be read just now.' } })
    );

    expect(gaps?.labels).toEqual([
      'Awaiting your approval',
      'Refunds owed or retrying',
      "Today's schedule",
    ]);
    expect(gaps?.sentence).toContain('3 readings could not be loaded');
    expect(gaps?.sentence).toContain(
      "Awaiting your approval, Refunds owed or retrying and Today's schedule."
    );
  });

  it('names a failed waiting scan even when every queue answered', () => {
    const gaps = describeOverviewGaps(
      accepted({ machinery: { waiting: unreadable, dead: ok(0), sample: [] } })
    );
    expect(gaps?.labels).toEqual(['Waiting background events']);
  });

  it('names an unreadable abandoned-events count once, not twice', () => {
    // The route counts `dead` once and reports it in both places; naming it in
    // both would tell an operator two things are broken when one is.
    const attention = {
      ...(body().attention as Record<string, unknown>),
      events_abandoned: unreadable,
    };
    const gaps = describeOverviewGaps(
      accepted({ attention, machinery: { waiting: ok(2), dead: unreadable, sample: [] } })
    );

    expect(gaps?.labels).toEqual(['Background events given up on']);
  });
});
