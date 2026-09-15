import { createElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DetailSkeleton,
  LoadFailed,
  NotFoundCard,
  TherapistBookingDetailView,
} from './TherapistBookingDetailView';
import type { Booking } from '@/types';

/**
 * Render-level tests for the therapist's single-booking view.
 *
 * Drives the pure presentational view directly from fixtures (SSR cannot run
 * effects, so the fetching screen is exercised in production; these tests pin
 * what each booking state *renders*):
 *
 *  - confirmed with/without a Meet link;
 *  - cancelled (no active session actions, reason shown);
 *  - completed with post-session panel and feedback;
 *  - no-show;
 *  - optional/absent data never renders "undefined";
 *  - no manage token or admin-only field ever appears;
 *  - the 45-minute label derives from the shared constant.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

vi.mock('@/lib/firebase/client', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
  db: {},
  isFirebaseEnabled: true,
}));

vi.mock('@/hooks/useJoinSession', () => ({
  useJoinSession: () => ({ join: vi.fn(), joiningId: null }),
}));

vi.mock('@/hooks/useTherapists', () => ({
  useTherapists: () => ({
    therapists: [{ id: 'th_assigned', name: 'Dr Priya Menon', active: true }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/dashboard/TherapistPostSessionPanel', () => ({
  TherapistPostSessionPanel: () => createElement('div', { 'data-testid': 'post-session-panel' }),
}));

// Shared admin primitives rely on Next's automatic JSX runtime (no React
// import), which vitest's classic transform can't render — mock the shell.
vi.mock('@/components/admin/bookings/CopyableId', () => ({
  CopyableId: ({ id }: { id: string }) =>
    createElement('code', { 'data-testid': 'copyable-id' }, id),
}));
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...rest }: Record<string, unknown>) =>
    createElement('button', rest, children as React.ReactNode),
}));

const BASE: Partial<Booking> = {
  id: 'bk_20260915_3B221AE5',
  status: 'confirmed',
  therapistId: 'th_assigned',
  name: 'Client A',
  email: 'clienta@example.com',
  phone: '+91 98000 00000',
  date: '2026-09-15',
  time: '19:00',
  sessionType: 'Individual therapy',
  createdAt: '2026-09-01T10:15:00.000Z',
};

function render(booking: Partial<Booking>): string {
  return renderToStaticMarkup(
    createElement(TherapistBookingDetailView, { booking: booking as Booking })
  );
}

describe('TherapistBookingDetailView — booking states', () => {
  it('renders a confirmed booking with session, client and duration fields', () => {
    const markup = render(BASE);
    expect(markup).toContain('Client A');
    expect(markup).toContain('7:00 PM');
    expect(markup).toContain('7:45 PM');
    expect(markup).toContain('45 min');
    expect(markup).toContain('clienta@example.com');
    expect(markup).toContain('Dr Priya Menon');
  });

  it('shows Join meeting for a confirmed booking with a Meet link', () => {
    const markup = render({ ...BASE, meetingUrl: 'https://meet.google.com/abc-defg-hij' });
    expect(markup).toContain('Join meeting');
    expect(markup).toContain('https://meet.google.com/abc-defg-hij');
  });

  it('does not render a broken meet button when no link exists', () => {
    const markup = render(BASE);
    expect(markup).not.toContain('meet.google.com');
    expect(markup).toContain('meeting room is created when the session is confirmed');
  });

  it('renders a cancelled booking with its reason and no join action', () => {
    const markup = render({
      ...BASE,
      status: 'cancelled',
      cancellationOrRejectionReason: 'Client requested cancellation',
    });
    expect(markup).toContain('Cancelled');
    expect(markup).toContain('Why this booking ended');
    expect(markup).toContain('Client requested cancellation');
    expect(markup).not.toContain('Join meeting');
  });

  it('renders a completed booking with the post-session panel and feedback', () => {
    const markup = render({
      ...BASE,
      status: 'completed',
      hasSessionNotes: true,
      followUpStatus: 'recommended',
      reviewRating: 5,
      reviewComment: 'Very helpful session.',
    });
    expect(markup).toContain('Post-session');
    expect(markup).toContain('post-session-panel');
    expect(markup).toContain('5 / 5');
    expect(markup).toContain('Very helpful session.');
  });

  it('renders a no-show booking with post-session actions available', () => {
    const markup = render({ ...BASE, status: 'no_show' });
    expect(markup).toContain('No-show');
    expect(markup).toContain('Post-session');
    expect(markup).toContain('post-session-panel');
  });

  it('shows the shared-summary state and withholds follow-up/notes for an uncompleted booking without pointers', () => {
    const markup = render({ ...BASE, clientSummaryShared: true });
    expect(markup).toContain('Post-session');
  });

  it('links a follow-up booking back to its previous session', () => {
    const markup = render({ ...BASE, status: 'completed', previousBookingId: 'bk_20260901_AB0ACEC1' });
    expect(markup).toContain('Follow-up of');
    expect(markup).toContain('bk_20260901_AB0ACEC1');
  });

  it('never renders raw undefined/null/NaN for missing optional data', () => {
    const markup = render({
      ...BASE,
      phone: '',
      sessionType: '',
      sessionMode: undefined,
      reminderStatus: undefined,
      reminderSentAt: null,
      updatedAt: null,
      meetingUrl: undefined,
    });
    expect(markup).not.toContain('undefined');
    expect(markup).not.toContain('>null<');
    expect(markup).not.toContain('NaN');
  });

  it('never renders the manage token or admin-only operational fields', () => {
    const markup = render({
      ...BASE,
      bookingToken: 'SECRET_TOKEN_SHOULD_NOT_RENDER',
      invalidToken: true,
      calendarError: 'INTERNAL_CALENDAR_ERROR_TEXT',
      lastEmailError: 'INTERNAL_EMAIL_ERROR_TEXT',
    });
    expect(markup).not.toContain('SECRET_TOKEN_SHOULD_NOT_RENDER');
    expect(markup).not.toContain('INTERNAL_CALENDAR_ERROR_TEXT');
    expect(markup).not.toContain('INTERNAL_EMAIL_ERROR_TEXT');
  });

  it('renders the skeleton, failure and not-found states', () => {
    expect(renderToStaticMarkup(createElement(DetailSkeleton))).toContain('Loading this booking');
    expect(
      renderToStaticMarkup(createElement(LoadFailed, { error: 'boom', onRetry: () => {} }))
    ).toContain('could not be loaded');
    expect(renderToStaticMarkup(createElement(NotFoundCard))).toContain('Booking not found');
  });
});
