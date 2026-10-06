import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../overview/useAdminOverview', () => ({ useAdminOverview: vi.fn() }));
vi.mock('../operations/useAdminOperations', () => ({ useAdminOperations: vi.fn() }));

import { SystemHealthScreen } from './SystemHealthScreen';
import { useAdminOverview } from '../../overview/useAdminOverview';
import { useAdminOperations } from '../operations/useAdminOperations';

const mockedOverview = vi.mocked(useAdminOverview);
const mockedOperations = vi.mocked(useAdminOperations);

function count(count: number, atLeast = false) {
  return { ok: true as const, count, atLeast };
}

function overviewData() {
  return {
    data: {
      generatedAtIso: '2026-10-06T09:00:00.000Z',
      istDate: '2026-10-06',
      attention: {
        awaiting_approval: count(2),
        lapsed_holds: count(0),
        missing_meet_link: count(3),
        refunds_outstanding: count(1),
        events_abandoned: count(4, true),
        emails_failed: count(5),
      },
      notes: { lapsed_holds: null },
      today: { ok: true as const, sessions: [], other: [], atLeast: false },
      machinery: {
        waiting: count(1),
        dead: count(4, true),
        sample: [],
      },
      scanLimit: 60,
    },
    loading: false,
    initialLoading: false,
    error: null,
    reload: vi.fn(),
  };
}

function operationsData() {
  return {
    data: {
      generatedAtIso: '2026-10-06T09:00:00.000Z',
      timelines: [],
      queuedEmailCount: 2,
      failedEmailCount: 5,
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
    },
    loading: false,
    initialLoading: false,
    error: null,
    reload: vi.fn(),
  };
}

describe('SystemHealthScreen rendering', () => {
  it('renders the queues with their counts, floors and destinations', () => {
    mockedOverview.mockReturnValue(overviewData() as never);
    mockedOperations.mockReturnValue(operationsData() as never);
    const html = renderToStaticMarkup(<SystemHealthScreen />);
    expect(html).toContain('Outbox dead letters');
    expect(html).toContain('4+');
    expect(html).toContain('Sessions missing a Meet link');
    expect(html).toContain('href="/admin/system/jobs"');
  });

  it('states that the scheduler runs outside the application', () => {
    mockedOverview.mockReturnValue(overviewData() as never);
    mockedOperations.mockReturnValue(operationsData() as never);
    const html = renderToStaticMarkup(<SystemHealthScreen />);
    expect(html).toContain('run outside this application');
  });

  it('carries the metrics caveats and the configuration checks', () => {
    mockedOverview.mockReturnValue(overviewData() as never);
    mockedOperations.mockReturnValue(operationsData() as never);
    const html = renderToStaticMarkup(<SystemHealthScreen />);
    expect(html).toContain('slot holds');
    expect(html).toContain('Missing');
  });

  it('renders a failed overview read as a named gap, not quiet queues', () => {
    mockedOverview.mockReturnValue({
      data: null,
      loading: false,
      initialLoading: false,
      error: 'We could not load the overview right now. Please try again.',
      reload: vi.fn(),
    } as never);
    mockedOperations.mockReturnValue(operationsData() as never);
    const html = renderToStaticMarkup(<SystemHealthScreen />);
    expect(html).toContain('This is missing, not empty');
    expect(html).not.toContain('Outbox dead letters');
  });

  it('fails whole-page only when both sources fail', () => {
    mockedOverview.mockReturnValue({
      data: null,
      loading: false,
      initialLoading: false,
      error: 'overview down',
      reload: vi.fn(),
    } as never);
    mockedOperations.mockReturnValue({
      data: null,
      loading: false,
      initialLoading: false,
      error: 'operations down',
      reload: vi.fn(),
    } as never);
    const html = renderToStaticMarkup(<SystemHealthScreen />);
    expect(html).toContain('System health could not be loaded');
  });
});
