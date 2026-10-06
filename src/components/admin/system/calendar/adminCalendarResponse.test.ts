import { describe, it, expect } from 'vitest';
import {
  interpretAdminCalendarResponse,
  describeCalendarGaps,
  GENERIC_CALENDAR_ERROR,
  CALENDAR_SESSION_ERROR,
} from './adminCalendarResponse';

/** A 200 body the route is contractually expected to send. */
function okBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    scanLimit: 60,
    problems: { ok: true, rows: [], atLeast: false },
    ...overrides,
  };
}

describe('interpretAdminCalendarResponse', () => {
  it('accepts a well-formed 200 payload', () => {
    const result = interpretAdminCalendarResponse(200, okBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.scanLimit).toBe(60);
      expect(result.payload.problems.ok).toBe(true);
    }
  });

  it('keeps rows and the atLeast floor from the scan', () => {
    const body = okBody({
      problems: {
        ok: true,
        atLeast: true,
        rows: [
          {
            id: 'bk_1',
            createdAtIso: null,
            status: 'confirmed',
            statusGroup: 'confirmed',
            paymentStatus: 'paid',
            paymentGroup: 'paid',
            clientName: 'A',
            clientEmail: 'a@x.com',
            clientPhone: '',
            therapistId: 't1',
            date: '2026-10-07',
            time: '10:00',
            sessionType: 'Individual',
            sessionMode: null,
            amountRupees: null,
            currency: null,
            hasMeetingLink: false,
            calendarStatus: 'FAILED',
            refundStatus: null,
            rescheduleCount: 0,
            calendarError: 'insert failed',
            hasCalendarEventId: false,
          },
        ],
      },
    });
    const result = interpretAdminCalendarResponse(200, body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.problems.ok ? result.payload.problems.rows[0]?.calendarError : null).toBe(
        'insert failed'
      );
      expect(result.payload.problems.ok ? result.payload.problems.atLeast : true).toBe(true);
    }
  });

  it('renders a failed scan as ok:false with the server reason', () => {
    const body = okBody({ problems: { ok: false, reason: 'Could not be read just now. Reload to try again.' } });
    const result = interpretAdminCalendarResponse(200, body);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.problems.ok).toBe(false);
      expect(describeCalendarGaps(result.payload)).toBe('Could not be read just now. Reload to try again.');
    }
  });

  it('refuses a body whose problems slice is the wrong shape', () => {
    expect(interpretAdminCalendarResponse(200, okBody({ problems: { ok: true, rows: 'nope' } }))).toEqual({
      ok: false,
      error: GENERIC_CALENDAR_ERROR,
    });
  });

  it('refuses non-200 and non-success bodies', () => {
    for (const [status, body] of [
      [500, { success: false, error: 'x' }],
      [200, { success: false }],
      [200, null],
      [200, 'string'],
    ] as const) {
      expect(interpretAdminCalendarResponse(status, body as unknown)).toEqual({
        ok: false,
        error: GENERIC_CALENDAR_ERROR,
      });
    }
  });

  it('names an expired session distinctly', () => {
    expect(interpretAdminCalendarResponse(401, null)).toEqual({ ok: false, error: CALENDAR_SESSION_ERROR });
  });

  it('has no gap sentence when the scan succeeded', () => {
    const result = interpretAdminCalendarResponse(200, okBody());
    expect(result.ok && describeCalendarGaps(result.payload) === null).toBe(true);
  });
});
