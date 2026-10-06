import { describe, it, expect } from 'vitest';
import {
  calendarStatusBadge,
  tallyCalendarProblems,
  isConfigurationError,
  describeCalendarScanBound,
  type CalendarProblemRow,
} from '@/domains/admin/calendarTriage';

function row(calendarStatus: string | null, error: string | null = null): CalendarProblemRow {
  return {
    id: 'bk_1',
    createdAtIso: null,
    status: 'confirmed',
    statusGroup: 'confirmed',
    paymentStatus: 'paid',
    paymentGroup: 'paid',
    clientName: 'Client',
    clientEmail: 'c@x.com',
    clientPhone: '',
    therapistId: 't1',
    date: '2026-10-07',
    time: '10:00',
    sessionType: 'Individual',
    sessionMode: null,
    amountRupees: null,
    currency: null,
    hasMeetingLink: false,
    calendarStatus,
    refundStatus: null,
    rescheduleCount: 0,
    calendarError: error,
    hasCalendarEventId: false,
  };
}

describe('calendarStatusBadge', () => {
  it('tells the operator whose court the ball is in', () => {
    expect(calendarStatusBadge('FAILED').tone).toBe('danger');
    expect(calendarStatusBadge('RETRY_REQUIRED').tone).toBe('warning');
    expect(calendarStatusBadge('PENDING').tone).toBe('info');
  });

  it('never renders an unrecognised status as a confident label', () => {
    const badge = calendarStatusBadge('SOMETHING_ELSE');
    expect(badge.tone).toBe('neutral');
    expect(badge.label).toContain('SOMETHING_ELSE');
  });
});

describe('tallyCalendarProblems', () => {
  it('counts by status with the human-relevant ones first', () => {
    const tallies = tallyCalendarProblems([
      row('PENDING'),
      row('FAILED'),
      row('FAILED'),
      row('RETRY_REQUIRED'),
    ]);
    expect(tallies.map((t) => t.status)).toEqual(['FAILED', 'RETRY_REQUIRED', 'PENDING']);
    expect(tallies[0]?.count).toBe(2);
  });

  it('maps unknown statuses into an explicit unknown bucket', () => {
    const tallies = tallyCalendarProblems([row('WEIRD')]);
    expect(tallies).toHaveLength(1);
    expect(tallies[0]?.status).toBe('unknown');
  });

  it('omits empty buckets rather than showing zero counts', () => {
    expect(tallyCalendarProblems([row('FAILED')])).toHaveLength(1);
    expect(tallyCalendarProblems([])).toHaveLength(0);
  });
});

describe('isConfigurationError', () => {
  it('spots the one error a retry cannot fix', () => {
    expect(isConfigurationError('Google Calendar credentials are not configured')).toBe(true);
    expect(isConfigurationError('insert failed: 500')).toBe(false);
    expect(isConfigurationError(null)).toBe(false);
  });
});

describe('describeCalendarScanBound', () => {
  it('admits truncation and stays silent on a complete scan', () => {
    expect(describeCalendarScanBound(true, 60)).toContain('60');
    expect(describeCalendarScanBound(false, 60)).toBeNull();
  });
});
