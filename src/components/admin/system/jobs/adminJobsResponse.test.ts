import { describe, it, expect } from 'vitest';
import {
  interpretAdminJobsResponse,
  GENERIC_JOBS_ERROR,
  JOBS_SESSION_ERROR,
} from './adminJobsResponse';
import {
  isReplayableEvent,
  attemptsDisplay,
  outboxStatusBadge,
  emailStatusBadge,
  type JobEventRow,
} from '@/domains/admin/jobsTriage';

function okBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    scanLimit: 60,
    outbox: {
      waiting: { ok: true, rows: [], atLeast: false },
      failed: { ok: true, rows: [], atLeast: false },
      dead: { ok: true, rows: [], atLeast: false },
    },
    emails: {
      queued: { ok: true, rows: [], atLeast: false },
      failed: { ok: true, rows: [], atLeast: false },
    },
    ...overrides,
  };
}

function deadEventRow(name: string, aggregateType = 'booking'): JobEventRow {
  return {
    id: 'outbox_booking_bk_1_BookingConfirmed',
    name,
    aggregateType,
    aggregateId: 'bk_1',
    status: 'dead',
    attempts: 5,
    maxAttempts: 5,
    createdAtIso: null,
    lastAttemptAtIso: null,
    nextAttemptAtIso: null,
    error: 'last failure',
  };
}

describe('interpretAdminJobsResponse', () => {
  it('accepts a well-formed 200 payload', () => {
    const result = interpretAdminJobsResponse(200, okBody());
    expect(result.ok).toBe(true);
  });

  it('refuses a payload missing any slice', () => {
    const body = okBody() as Record<string, unknown>;
    const partial = { ...body, outbox: { waiting: {}, failed: {} } };
    expect(interpretAdminJobsResponse(200, partial)).toEqual({ ok: false, error: GENERIC_JOBS_ERROR });
  });

  it('refuses non-200 bodies and names session expiry', () => {
    expect(interpretAdminJobsResponse(500, { success: false })).toEqual({
      ok: false,
      error: GENERIC_JOBS_ERROR,
    });
    expect(interpretAdminJobsResponse(401, null)).toEqual({ ok: false, error: JOBS_SESSION_ERROR });
  });
});

describe('replay eligibility', () => {
  it('allows exactly the two lifecycle events, for booking aggregates only', () => {
    expect(isReplayableEvent(deadEventRow('BookingConfirmed'))).toBe(true);
    expect(isReplayableEvent(deadEventRow('BookingExpired'))).toBe(true);
    expect(isReplayableEvent(deadEventRow('PaymentSucceeded'))).toBe(false);
    expect(isReplayableEvent(deadEventRow('BookingConfirmed', 'payment'))).toBe(false);
  });

  it('shows attempts against their ceiling', () => {
    expect(attemptsDisplay({ attempts: 5, maxAttempts: 5 })).toBe('5 of 5 attempts used');
  });
});

describe('status badges', () => {
  it('marks dead letters as the one status nobody will retry', () => {
    expect(outboxStatusBadge('dead').tone).toBe('danger');
    expect(outboxStatusBadge('pending').tone).toBe('neutral');
  });

  it('never fakes confidence about an unknown status', () => {
    expect(outboxStatusBadge('mystery').tone).toBe('neutral');
    expect(emailStatusBadge('mystery').label).toContain('mystery');
  });
});
