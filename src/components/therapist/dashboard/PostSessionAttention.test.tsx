import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Booking } from '@/types';
import { PostSessionAttention } from './PostSessionAttention';

describe('PostSessionAttention navigation', () => {
  it('deep-links Add notes while leaving View on the normal detail route', () => {
    const session = {
      id: 'booking-1',
      status: 'completed',
      date: '2026-10-01',
      time: '14:30',
      name: 'Client',
      hasSessionNotes: false,
    } as Booking;

    const markup = renderToStaticMarkup(
      createElement(PostSessionAttention, { sessions: [session] })
    );

    expect(markup).toContain('href="/therapist/bookings/booking-1#post-session-notes"');
    expect(markup).toContain('href="/therapist/bookings/booking-1"');
    expect(markup).not.toContain('Client#');
  });
});
