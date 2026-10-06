import { describe, it, expect } from 'vitest';
import {
  emailStatusBadge,
  filterEmailLog,
  tallyEmailLog,
  type EmailLogRow,
} from '@/domains/admin/emailTriage';

function row(overrides: Partial<EmailLogRow> = {}): EmailLogRow {
  return {
    id: 'email_bk_1_booking-confirmed',
    bookingId: 'bk_1',
    type: 'booking-confirmed',
    recipient: 'client@example.com',
    subject: 'Your session is confirmed',
    status: 'sent',
    attemptCount: 1,
    lastError: null,
    createdAtIso: '2026-10-06T09:00:00.000Z',
    updatedAtIso: null,
    ...overrides,
  };
}

describe('emailStatusBadge', () => {
  it('separates the terminal failure from the in-flight states', () => {
    expect(emailStatusBadge('failed').tone).toBe('danger');
    expect(emailStatusBadge('queued').tone).toBe('info');
    expect(emailStatusBadge('sending').tone).toBe('info');
    expect(emailStatusBadge('sent').tone).toBe('success');
    expect(emailStatusBadge('delivered').tone).toBe('success');
  });

  it('never fakes confidence about an unknown status', () => {
    const badge = emailStatusBadge('weird');
    expect(badge.tone).toBe('neutral');
    expect(badge.label).toContain('weird');
  });
});

describe('tallyEmailLog', () => {
  it('orders failures first', () => {
    const tallies = tallyEmailLog([row(), row({ status: 'failed' }), row({ status: 'queued' })]);
    expect(tallies.map((t) => t.status)).toEqual(['failed', 'queued', 'sent']);
  });
});

describe('filterEmailLog', () => {
  const rows = [
    row(),
    row({ id: 'e2', recipient: 'other@example.com', status: 'failed', type: 'booking-declined' }),
  ];

  it('filters by status and by term across the searchable fields', () => {
    expect(filterEmailLog(rows, 'failed', '')).toHaveLength(1);
    expect(filterEmailLog(rows, null, 'other@example')).toHaveLength(1);
    expect(filterEmailLog(rows, null, 'declined')).toHaveLength(1);
    expect(filterEmailLog(rows, null, 'bk_1')).toHaveLength(2);
  });

  it('treats the combined filter as a conjunction', () => {
    expect(filterEmailLog(rows, 'failed', 'client@example')).toHaveLength(0);
  });

  it('is a no-op with all/no filters', () => {
    expect(filterEmailLog(rows, 'all', '  ')).toHaveLength(2);
  });
});
