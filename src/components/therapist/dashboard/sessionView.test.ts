import { describe, expect, it } from 'vitest';
import type { Booking } from '@/types';
import { parseSessionView, sessionsForView } from './sessionView';

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
