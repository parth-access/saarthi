import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Booking } from '@/types';

vi.mock('./TherapistSessionRow', () => ({ TherapistSessionRow: () => null }));
vi.mock('./NextSessionHero', () => ({ NextSessionHero: () => null, NoUpcomingSession: () => null }));
vi.mock('./PostSessionAttention', () => ({ PostSessionAttention: () => null, PostSessionAllClear: () => null }));
import { TherapistDashboardView } from './TherapistDashboardView';

const booking = (id: string, status: Booking['status']) => ({
  id, status, date: '2026-10-10', time: '10:00', name: 'Client',
}) as Booking;

describe('therapist dashboard CTA destinations', () => {
  it('links each intent to a URL-driven sessions view', () => {
    const html = renderToStaticMarkup(
      <TherapistDashboardView
        therapist={null}
        nextSession={null}
        todaySessions={[]}
        pendingRequests={[booking('request', 'pending_approval')]}
        upcomingSessions={[booking('upcoming', 'confirmed')]}
        recentSessions={[booking('history', 'completed')]}
        needsAttention={[]}
        stats={{ today: 0, pending: 1, upcoming: 1, attention: 0 }}
      />
    );

    expect(html).toContain('href="/therapist/sessions?view=requests"');
    expect(html).toContain('href="/therapist/sessions?view=upcoming"');
    expect(html).toContain('href="/therapist/sessions?view=history"');
    expect(html).toContain('href="/therapist/sessions"'); // distinct unfiltered quick action
  });
});
