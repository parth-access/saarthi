import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OperationsDashboardPayload } from '@/domains/admin/operationsTriage';

vi.mock('./useAdminOperations', () => ({
  useAdminOperations: vi.fn(),
  useOperationsSearch: vi.fn(() => ({
    result: null,
    loading: false,
    error: null,
    ran: false,
    run: vi.fn(),
  })),
}));

import { OperationsScreen } from './OperationsScreen';
import { useAdminOperations } from './useAdminOperations';

const mockedHook = vi.mocked(useAdminOperations);

function payload(overrides: Partial<OperationsDashboardPayload> = {}): OperationsDashboardPayload {
  return {
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    timelines: [
      {
        id: 'tl_1',
        event: 'BookingConfirmed',
        severity: 'info',
        message: 'Booking confirmed',
        actorType: 'admin',
        correlationId: 'corr_1',
        bookingId: 'bk_1',
        paymentId: null,
        emailId: null,
        createdAtIso: '2026-10-06T09:00:00.000Z',
      },
    ],
    queuedEmailCount: 2,
    failedEmailCount: 0,
    metrics: [
      {
        date: '2026-10-06',
        bookingsCreated: 12,
        bookingsConfirmed: 3,
        bookingsCancelled: 1,
        paymentsSucceeded: 3,
        paymentsFailed: 0,
        emailsQueued: 9,
        emailsSent: 9,
        emailsFailed: 0,
      },
    ],
    diagnostics: { resendConfigured: true, razorpayConfigured: false, nodeEnv: 'production' },
    ...overrides,
  };
}

function mockState(data: OperationsDashboardPayload | null, error: string | null = null) {
  mockedHook.mockReturnValue({ data, loading: false, initialLoading: false, error, reload: vi.fn() });
}

describe('OperationsScreen rendering', () => {
  it('renders the health tab with real counts and labeled configuration', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<OperationsScreen />);
    expect(html).toContain('Queued and waiting');
    expect(html).toContain('Failed, needing a person');
    expect(html).toContain('Payments (Razorpay)');
    expect(html).toContain('Missing');
  });

  it('labels the machinery counters with their UTC/slot-hold caveats', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<OperationsScreen />);
    expect(html).toContain('UTC');
    expect(html).toContain('slot holds');
    expect(html).toContain('Holds created');
  });

  it('offers the timeline tab from the default health view', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<OperationsScreen />);
    // Static render shows the default (Health) tab; the Timeline tab is offered
    // as a control, and its rows are a click away — pinned here as the tab
    // existing, with its content covered by the TimelineList's pure pieces.
    expect(html).toContain('Timeline');
    expect(html).toContain('Health');
    expect(html).toContain('Trace &amp; search');
  });

  it('never renders the legacy theatre', () => {
    mockState(payload());
    const html = renderToStaticMarkup(<OperationsScreen />);
    expect(html).not.toContain('184ms');
    expect(html).not.toContain('Live Streaming');
    expect(html).not.toContain('saarthi-v5.5-prod');
    expect(html).not.toContain('Queue Status: Normal');
  });
});
