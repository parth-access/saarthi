import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdminJobsPayload } from './adminJobsResponse';
import type { JobEventRow, JobEmailRow } from '@/domains/admin/jobsTriage';

vi.mock('./useAdminJobs', () => ({ useAdminJobs: vi.fn() }));

import { JobsScreen } from './JobsScreen';
import { useAdminJobs } from './useAdminJobs';

const mockedHook = vi.mocked(useAdminJobs);

function eventRow(overrides: Partial<JobEventRow> = {}): JobEventRow {
  return {
    id: 'outbox_booking_bk_1_BookingConfirmed',
    name: 'BookingConfirmed',
    aggregateType: 'booking',
    aggregateId: 'bk_1',
    status: 'dead',
    attempts: 5,
    maxAttempts: 5,
    createdAtIso: null,
    lastAttemptAtIso: null,
    nextAttemptAtIso: null,
    error: 'dispatch exploded',
    ...overrides,
  };
}

function emailRow(overrides: Partial<JobEmailRow> = {}): JobEmailRow {
  return {
    id: 'email_bk_1_booking-confirmed',
    bookingId: 'bk_1',
    type: 'booking-confirmed',
    recipient: 'client@example.com',
    subject: 'Your session is confirmed',
    status: 'failed',
    attemptCount: 4,
    lastError: 'resend 5xx',
    createdAtIso: null,
    updatedAtIso: null,
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}): AdminJobsPayload {
  return {
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    outbox: {
      waiting: { ok: true, rows: [], atLeast: false },
      failed: { ok: true, rows: [], atLeast: false },
      dead: { ok: true, rows: [], atLeast: false },
    },
    emails: {
      queued: { ok: true, rows: [], atLeast: false },
      failed: { ok: true, rows: [], atLeast: false },
    },
    scanLimit: 60,
    ...overrides,
  } as AdminJobsPayload;
}

function mockState(data: AdminJobsPayload | null, error: string | null = null) {
  mockedHook.mockReturnValue({ data, loading: false, initialLoading: false, error, reload: vi.fn() });
}

describe('JobsScreen rendering', () => {
  it('offers replay for a dead, replayable event and names the error', () => {
    mockState(payload({ outbox: { waiting: { ok: true, rows: [], atLeast: false }, failed: { ok: true, rows: [], atLeast: false }, dead: { ok: true, rows: [eventRow()], atLeast: false } } }));
    const html = renderToStaticMarkup(<JobsScreen />);
    expect(html).toContain('Dead letters');
    expect(html).toContain('BookingConfirmed');
    expect(html).toContain('dispatch exploded');
    expect(html).toContain('Replay BookingConfirmed');
  });

  it('offers resend for a failed email', () => {
    mockState(payload({ emails: { queued: { ok: true, rows: [], atLeast: false }, failed: { ok: true, rows: [emailRow()], atLeast: false } } }));
    const html = renderToStaticMarkup(<JobsScreen />);
    expect(html).toContain('client@example.com');
    expect(html).toContain('Resend email');
  });

  it('renders real empties as real empties', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<JobsScreen />);
    expect(html).toContain('a real empty, not a failed read');
  });

  it('renders a failed dead-letter scan as a named gap, not an empty queue', () => {
    mockState(
      payload({
        outbox: {
          waiting: { ok: true, rows: [], atLeast: false },
          failed: { ok: true, rows: [], atLeast: false },
          dead: { ok: false, reason: 'Could not be read just now. Reload to try again.' },
        },
      })
    );
    const html = renderToStaticMarkup(<JobsScreen />);
    expect(html).toContain('This is missing, not empty');
  });

  it('keeps an unreplayable dead event honest instead of offering a button', () => {
    mockState(
      payload({
        outbox: {
          waiting: { ok: true, rows: [], atLeast: false },
          failed: { ok: true, rows: [], atLeast: false },
          dead: { ok: true, rows: [eventRow({ name: 'PaymentCaptured' })], atLeast: false },
        },
      })
    );
    const html = renderToStaticMarkup(<JobsScreen />);
    expect(html).toContain('No replay for this event type');
    expect(html).not.toContain('Replay PaymentCaptured');
  });
});
