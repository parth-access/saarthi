import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./useAdminActivity', () => ({ useAdminActivity: vi.fn() }));

import { ActivityScreen } from './ActivityScreen';
import { useAdminActivity } from './useAdminActivity';

const mockedHook = vi.mocked(useAdminActivity);

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tl_1',
    event: 'BookingConfirmed',
    severity: 'info',
    message: 'Booking confirmed for Asha',
    actorType: 'admin',
    actorId: 'uid_admin',
    correlationId: 'corr_1',
    bookingId: 'bk_1',
    paymentId: null,
    emailId: null,
    metadata: { source: 'replay' },
    createdAtIso: '2026-10-06T09:00:00.000Z',
    ...overrides,
  };
}

function mockState(overrides: Record<string, unknown> = {}) {
  mockedHook.mockReturnValue({
    pages: [],
    entries: [entry()],
    loading: false,
    initialLoading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    failed: false,
    failedReason: null,
    reload: vi.fn(),
    loadMore: vi.fn(),
    ...overrides,
  } as never);
}

describe('ActivityScreen rendering', () => {
  it('renders entries with severity, actor and the filter pills', () => {
    mockState();
    const html = renderToStaticMarkup(<ActivityScreen />);
    expect(html).toContain('BookingConfirmed');
    expect(html).toContain('Actor: admin');
    expect(html).toContain('correlation: corr_1');
    expect(html).toContain('open booking');
    expect(html).toContain('href="/admin/bookings/bk_1"');
  });

  it('renders a failed read as a named gap, not an empty log', () => {
    mockState({ entries: [], failed: true, failedReason: 'Could not be read just now. Reload to try again.' });
    const html = renderToStaticMarkup(<ActivityScreen />);
    expect(html).toContain('This is missing, not empty');
  });

  it('renders a real empty for an unfiltered read', () => {
    mockState({ entries: [] });
    const html = renderToStaticMarkup(<ActivityScreen />);
    expect(html).toContain('a platform with no traffic shows nothing here');
  });

  it('offers Load more only when a cursor remains', () => {
    mockState({ hasMore: true });
    expect(renderToStaticMarkup(<ActivityScreen />)).toContain('Load more');
    mockState({ hasMore: false });
    expect(renderToStaticMarkup(<ActivityScreen />)).not.toContain('Load more');
  });
});
