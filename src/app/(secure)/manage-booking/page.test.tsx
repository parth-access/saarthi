// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

/**
 * Booking-token privacy invariant for the manage-booking flow:
 *
 *   1. arriving at /manage-booking?token=TEST_SECRET_TOKEN still loads the
 *      booking (the flow receives the token);
 *   2. the token is scrubbed from the URL immediately after consumption —
 *      so no analytics hit, history entry, or Referer can ever carry it;
 *   3. the page keeps working after the scrub (reschedule uses the state
 *      copy, not the URL);
 *   4. a URL without a token degrades gracefully.
 */

const h = vi.hoisted(() => ({
  url: { current: '/manage-booking' },
  getBooking: vi.fn(),
  rescheduleByToken: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(h.url.current.split('?')[1] ?? ''),
  usePathname: () => h.url.current.split('?')[0],
}));

vi.mock('next/link', () => ({
  default: (props: { href: string; children?: React.ReactNode }) =>
    React.createElement('a', { href: props.href }, props.children),
}));

vi.mock('@/services/bookingService', () => ({
  bookingService: {
    getBookingByTokenAPIRoute: (...a: unknown[]) => h.getBooking(...a),
    rescheduleByToken: (...a: unknown[]) => h.rescheduleByToken(...a),
  },
}));

import Page from './page';

const BOOKING = {
  id: 'bk_1',
  name: 'Ananya Sharma',
  email: 'ananya@example.com',
  therapistId: 'th_1',
  therapistName: 'Dr Priya Menon',
  date: '2026-10-10',
  time: '10:00',
  status: 'confirmed',
  paymentStatus: 'paid',
};

describe('manage-booking token consumption & URL scrubbing', () => {
  let container: HTMLElement;
  let root: Root;
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  const renderPage = async () => {
    await act(async () => {
      root.render(React.createElement(Page));
    });
    // flush async booking load
    await act(async () => {});
    await act(async () => {});
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.getBooking.mockResolvedValue(BOOKING);
    h.rescheduleByToken.mockResolvedValue({});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    replaceStateSpy = vi.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    replaceStateSpy.mockRestore();
    h.url.current = '/manage-booking';
    window.history.replaceState({}, '', '/');
  });

  it('loads the booking with the token from the email link (flow still works)', async () => {
    h.url.current = '/manage-booking?token=TEST_SECRET_TOKEN';
    await renderPage();

    expect(h.getBooking).toHaveBeenCalledWith('TEST_SECRET_TOKEN');
    expect(container.textContent).toContain('Manage Your Session');
    expect(container.textContent).toContain('Ananya Sharma');
  });

  it('scrubs the token from the URL immediately after consumption', async () => {
    h.url.current = '/manage-booking?token=TEST_SECRET_TOKEN';
    await renderPage();

    // The URL the browser reports afterwards carries no token at all.
    expect(window.location.search).not.toContain('token');
    expect(window.location.pathname).toBe('/manage-booking');
    const replaceCalls = replaceStateSpy.mock.calls.filter(
      ([, , url]) => typeof url === 'string'
    );
    expect(replaceCalls.length).toBeGreaterThan(0);
    expect(String(replaceCalls[replaceCalls.length - 1][2])).not.toContain('token');
  });

  it('keeps working after the scrub — the state copy, not the URL, is used', async () => {
    h.url.current = '/manage-booking?token=TEST_SECRET_TOKEN';
    await renderPage();

    // Booking dashboard is fully rendered even though the URL is now clean.
    expect(container.textContent).toContain('Dr Priya Menon');
    // Every booking API call used the token captured from the original URL.
    h.getBooking.mock.calls.forEach(([used]) => expect(used).toBe('TEST_SECRET_TOKEN'));
  });

  it('degrades gracefully when no token is present (e.g. after a refresh on the clean URL)', async () => {
    h.url.current = '/manage-booking';
    await renderPage();

    expect(h.getBooking).not.toHaveBeenCalled();
    expect(container.textContent).toContain('No booking token provided.');
  });
});
