import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdminEmailsPayload } from './adminEmailsResponse';
import type { EmailLogRow } from '@/domains/admin/emailTriage';

vi.mock('./useAdminEmails', () => ({ useAdminEmails: vi.fn() }));
vi.mock('./useAdminEmailDetail', () => ({ useAdminEmailDetail: vi.fn(() => ({ kind: 'idle' })) }));

import { EmailScreen } from './EmailScreen';
import { useAdminEmails } from './useAdminEmails';

const mockedHook = vi.mocked(useAdminEmails);

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

function payload(overrides: Record<string, unknown> = {}): AdminEmailsPayload {
  return {
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    bookingId: null,
    scanLimit: 100,
    emails: { ok: true, rows: [row()], atLeast: false },
    ...overrides,
  } as AdminEmailsPayload;
}

function mockState(data: AdminEmailsPayload | null, error: string | null = null) {
  mockedHook.mockReturnValue({ data, loading: false, initialLoading: false, error, reload: vi.fn() });
}

describe('EmailScreen rendering', () => {
  it('renders log rows with the booking link', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<EmailScreen />);
    expect(html).toContain('client@example.com');
    expect(html).toContain('href="/admin/bookings/bk_1"');
    expect(html).toContain('Most recent emails');
  });

  it('renders the lookup panel with its server-side framing', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<EmailScreen />);
    expect(html).toContain('Find every email for one booking');
  });

  it('renders a failed scan as a named gap, not an empty list', () => {
    mockState(payload({ emails: { ok: false, reason: 'Could not be read just now. Reload to try again.' } }));
    const html = renderToStaticMarkup(<EmailScreen />);
    expect(html).toContain('This is missing, not empty');
    expect(html).not.toContain('client@example.com');
  });

  it('says the lookup found nothing without pretending the read failed', () => {
    mockState(payload({ bookingId: 'bk_1', emails: { ok: true, rows: [], atLeast: false } }));
    const html = renderToStaticMarkup(<EmailScreen />);
    expect(html).toContain('No email has been logged for this booking');
    expect(html).toContain('Emails for booking bk_1');
  });
});
