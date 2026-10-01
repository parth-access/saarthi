import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '@/types';
import { TherapistPostSessionPanel } from './TherapistPostSessionPanel';

vi.mock('@/lib/firebase/client', () => ({
  auth: { currentUser: { getIdToken: async () => 'firebase-token' } },
}));

const COMPLETED_BOOKING = {
  id: 'source-booking',
  therapistId: 'therapist-1',
  status: 'completed',
  followUpStatus: 'recommended',
} as Booking;

describe('TherapistPostSessionPanel follow-up recommendation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens the private field and renders a truthful non-interactive recommendation', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const markup = renderToStaticMarkup(
      createElement(TherapistPostSessionPanel, {
        booking: COMPLETED_BOOKING,
        focusPrivateNotes: true,
      })
    );

    expect(markup).toContain('Private notes (never shared)');
    expect(markup).toContain('autofocus');
    expect(markup).toContain(
      'Follow-up recommended. Scheduling is unavailable until secure client payment is ready.'
    );
    expect(markup).not.toContain('/therapist/book?followUp=1');
    expect(markup).not.toContain('Schedule the follow-up now');
    expect(markup).not.toContain('/api/bookings/schedule-follow-up');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
