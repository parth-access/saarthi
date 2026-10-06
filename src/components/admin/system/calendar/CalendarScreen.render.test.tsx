import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdminCalendarPayload } from './adminCalendarResponse';

/**
 * The screen's rendered states, pinned at the markup level: a named gap never
 * reads as an empty queue, and the retry action is offered on problem rows.
 */

function payload(
  problems: AdminCalendarPayload['problems']
): AdminCalendarPayload {
  return { generatedAtIso: '2026-10-06T09:00:00.000Z', problems, scanLimit: 60 };
}

const emptyOk = payload({ ok: true, rows: [], atLeast: false });

vi.mock('./useAdminCalendar', () => ({
  useAdminCalendar: vi.fn(),
}));

import { CalendarScreen } from './CalendarScreen';
import { useAdminCalendar } from './useAdminCalendar';

const mockedHook = vi.mocked(useAdminCalendar);

function mockState(data: AdminCalendarPayload | null, error: string | null = null) {
  mockedHook.mockReturnValue({
    data,
    loading: false,
    initialLoading: false,
    error,
    reload: vi.fn(),
  });
}

describe('CalendarScreen rendering', () => {
  it('renders problem rows with the retry action and booking link', () => {
    mockState(
      payload({
        ok: true,
        atLeast: false,
        rows: [
          {
            id: 'bk_20261001_ABC123',
            createdAtIso: null,
            status: 'confirmed',
            statusGroup: 'confirmed',
            paymentStatus: 'paid',
            paymentGroup: 'paid',
            clientName: 'Test Client',
            clientEmail: 'c@x.com',
            clientPhone: '',
            therapistId: 't1',
            date: '2026-10-07',
            time: '10:00',
            sessionType: 'Individual Therapy',
            sessionMode: null,
            amountRupees: null,
            currency: null,
            hasMeetingLink: false,
            calendarStatus: 'FAILED',
            refundStatus: null,
            rescheduleCount: 0,
            calendarError: 'insert failed',
            hasCalendarEventId: false,
          },
        ],
      })
    );
    const html = renderToStaticMarkup(<CalendarScreen />);
    expect(html).toContain('Sessions missing a Meet link');
    expect(html).toContain('Test Client');
    expect(html).toContain('Create calendar event');
    expect(html).toContain('href="/admin/bookings/bk_20261001_ABC123"');
    expect(html).toContain('insert failed');
  });

  it('renders a real empty as a real empty', () => {
    mockState(emptyOk);
    const html = renderToStaticMarkup(<CalendarScreen />);
    expect(html).toContain('Every confirmed session in what was scanned has a Meet link');
    expect(html).toContain('a real empty, not a failed read');
    expect(html).not.toContain('Create calendar event');
  });

  it('renders a failed scan as a named gap, not an empty list', () => {
    mockState(payload({ ok: false, reason: 'Could not be read just now. Reload to try again.' }));
    const html = renderToStaticMarkup(<CalendarScreen />);
    expect(html).toContain('This is missing, not empty');
    expect(html).not.toContain('Every confirmed session');
  });

  it('keeps the last good list behind a failed refresh', () => {
    mockState(emptyOk, 'We could not load the calendar list just now. Please try again.');
    const html = renderToStaticMarkup(<CalendarScreen />);
    expect(html).toContain('This did not refresh.');
    expect(html).toContain('a real empty, not a failed read');
  });

  it('never renders the retry action on a configuration error row', () => {
    mockState(
      payload({
        ok: true,
        atLeast: false,
        rows: [
          {
            id: 'bk_1',
            createdAtIso: null,
            status: 'confirmed',
            statusGroup: 'confirmed',
            paymentStatus: 'paid',
            paymentGroup: 'paid',
            clientName: 'Test Client',
            clientEmail: 'c@x.com',
            clientPhone: '',
            therapistId: 't1',
            date: '2026-10-07',
            time: '10:00',
            sessionType: 'Individual Therapy',
            sessionMode: null,
            amountRupees: null,
            currency: null,
            hasMeetingLink: false,
            calendarStatus: 'FAILED',
            refundStatus: null,
            rescheduleCount: 0,
            calendarError: 'Google Calendar credentials are not configured',
            hasCalendarEventId: false,
          },
        ],
      })
    );
    const html = renderToStaticMarkup(<CalendarScreen />);
    expect(html).toContain('Needs configuration');
    expect(html).not.toContain('Create calendar event');
  });
});
