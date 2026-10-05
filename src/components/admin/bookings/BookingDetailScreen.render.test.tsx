import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/hooks/useTherapists', () => ({
  useTherapists: () => ({ therapists: [], loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('./useAdminBookingDetail', () => ({
  useAdminBookingDetail: () => ({
    data: null,
    loading: false,
    initialLoading: false,
    error: null,
    notFound: true,
    reload: vi.fn(),
  }),
}));

import { BookingDetailScreen } from './BookingDetailScreen';

/**
 * A booking detail page is always one hop below the bookings list; the way back
 * must be a deterministic link, not a browser-history step (the same URL can be
 * opened from an email, a search result, or a paste).
 */
describe('admin booking detail navigation', () => {
  const html = renderToStaticMarkup(<BookingDetailScreen bookingId="bk_20260915_3B221AE5" />);

  it('links back to the bookings list', () => {
    expect(html).toContain('Back to Bookings');
    expect(html).toContain('href="/admin/bookings"');
  });

  it('never steps through browser history', () => {
    expect(html).not.toContain('history.back');
  });

  it('keeps its distinct not-found state', () => {
    expect(html).toContain('No booking with this id');
  });
});
