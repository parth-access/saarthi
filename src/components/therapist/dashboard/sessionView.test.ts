import { describe, expect, it } from 'vitest';
import type { Booking } from '@/types';
import { orderSessions, parseSessionView, sessionsForView } from './sessionView';

const booking = (id: string, status: Booking['status']) => ({ id, status }) as Booking;
const all = [
  booking('pending', 'pending'),
  booking('approval', 'pending_approval'),
  booking('future', 'confirmed'),
  booking('today', 'confirmed'),
  booking('paid-later', 'awaiting_payment'),
  booking('done', 'completed'),
  booking('cancelled', 'cancelled'),
  booking('missed', 'no_show'),
];
const upcoming = [all[2], all[4]];

describe('therapist sessions URL views', () => {
  it.each(['requests', 'upcoming', 'history'] as const)('accepts %s on direct navigation/refresh', (view) => {
    expect(parseSessionView(new URL(`https://example.test/therapist/sessions?view=${view}`).searchParams.get('view'))).toBe(view);
  });

  it('falls back to all for missing or unknown views', () => {
    expect(parseSessionView(null)).toBe('all');
    expect(parseSessionView('anything')).toBe('all');
  });

  it('matches the pending request statuses', () => {
    expect(sessionsForView(all, 'requests', upcoming).map((row) => row.id)).toEqual(['pending', 'approval']);
  });

  it('uses the dashboard upcoming set rather than all confirmed or today sessions', () => {
    expect(sessionsForView(all, 'upcoming', upcoming).map((row) => row.id)).toEqual(['future', 'paid-later']);
  });

  it('shows closed sessions for history, and leaves all untouched', () => {
    expect(sessionsForView(all, 'history', upcoming).map((row) => row.id)).toEqual(['done', 'cancelled', 'missed']);
    expect(sessionsForView(all, 'all', upcoming)).toEqual(all);
  });
});

describe('orderSessions', () => {
  const at = (id: string, date: string, time: string) => ({ id, date, time }) as Booking;
  it('lists today and later soonest first, then earlier sessions most recent first', () => {
    const rows = [
      at('past-old', '2026-10-01', '10:00'),
      at('next-week', '2026-11-04', '09:00'),
      at('today-late', '2026-10-28', '18:00'),
      at('yesterday', '2026-10-27', '12:00'),
      at('today-early', '2026-10-28', '09:00'),
    ];
    expect(orderSessions(rows, '2026-10-28').map((row) => row.id)).toEqual([
      'today-early',
      'today-late',
      'next-week',
      'yesterday',
      'past-old',
    ]);
  });
});
