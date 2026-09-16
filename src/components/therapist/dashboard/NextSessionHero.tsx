'use client';

/**
 * The strongest visual element on the therapist dashboard: the next session.
 *
 * A therapist opening Saarthi should see their next session, its time, the
 * client, and the Join button without scrolling or searching. Uses the
 * existing `useJoinSession` flow — no new meeting-join mechanism.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Clock3, FileText, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { JoinSessionButton } from '@/components/dashboard/TherapistDashboard';
import { formatTime12h } from '@/components/booking/bookingUi';
import { statusBadge, toneClasses } from '@/components/admin/bookings/adminBookingPresentation';
import { sessionStartMs } from '@/lib/sessionDisplay';
import { SESSION_DURATION_MINUTES } from '@/shared/constants/index';
import { isToday, parseISO, format } from 'date-fns';
import type { Booking } from '@/types';

function relativeLabel(startMs: number, nowMs: number): string | null {
  if (!Number.isFinite(startMs)) return null;
  const diffMs = startMs - nowMs;
  if (diffMs < 0) return null; // in the past
  if (diffMs < 5 * 60 * 1000) return 'Starting soon';
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.round(diffMs / 60_000);
    return `Starts in ${mins}m`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(diffMs / 3_600_000);
    const mins = Math.round((diffMs % 3_600_000) / 60_000);
    return mins > 0 ? `Starts in ${hours}h ${mins}m` : `Starts in ${hours}h`;
  }
  return null;
}

interface NextSessionHeroProps {
  readonly booking: Booking;
}

export function NextSessionHero({ booking }: NextSessionHeroProps) {
  const badge = statusBadge(booking);
  const time12 = formatTime12h(booking.time);
  const isConfirmed = booking.status === 'confirmed';

  // Session date display
  const isTodaySession = booking.date ? (() => {
    try { return isToday(parseISO(booking.date)); } catch { return false; }
  })() : false;

  const dateLabel = booking.date ? (() => {
    try {
      const d = parseISO(booking.date);
      return isTodaySession ? 'Today' : format(d, 'EEE, MMM d');
    } catch { return booking.date; }
  })() : '—';

  // Relative countdown — refreshed once per minute, not per second
  const [nowMs, setNowMs] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const startMs = useMemo(() => sessionStartMs(booking), [booking]);
  const countdown = useMemo(() => relativeLabel(startMs, nowMs), [startMs, nowMs]);

  return (
    <section
      aria-label="Next session"
      className="rounded-xl border border-primary/20 bg-white p-4 shadow-sm ring-1 ring-primary/5 sm:p-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-accent">
          <Video className="h-3.5 w-3.5" aria-hidden="true" />
          Next session
        </p>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-[0.6875rem] font-medium',
            toneClasses(badge.tone)
          )}
          title={badge.title}
        >
          {badge.label}
        </span>
        {countdown && (
          <span className="rounded-md border border-primary/10 bg-primary/5 px-2 py-0.5 text-[0.6875rem] font-medium text-primary">
            {countdown}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: time + client */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-3xl font-semibold tabular-nums text-primary">
              {time12}
            </span>
            <span className="rounded-md border border-hairline bg-neutral-surface px-1.5 py-0.5 text-[0.6875rem] font-medium text-primary/70">
              {SESSION_DURATION_MINUTES} min
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {dateLabel}
            </span>
            <span>·</span>
            <span>{booking.sessionType || 'Individual'} therapy</span>
          </div>

          <p className="mt-2 text-sm font-semibold text-primary">
            {booking.name || 'Client'}
          </p>

          {/* Meeting availability note */}
          <p className="mt-2 text-xs text-muted-foreground">
            {!isConfirmed ? (
              'Waiting for the client to complete payment'
            ) : booking.meetingUrl ? (
              <span className="flex items-center gap-1 text-success">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                Meet room ready
              </span>
            ) : (
              'Meet room is created when you join'
            )}
          </p>
        </div>

        {/* Right: actions */}
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          {isConfirmed ? (
            <>
              <JoinSessionButton booking={booking} className="h-10 w-full px-5 text-sm sm:w-auto" />
              <span className="text-center text-[0.625rem] text-muted-foreground sm:text-right">
                Opens Google Meet in a new tab
              </span>
            </>
          ) : (
            <span className="rounded-lg border border-warning/25 bg-warning-surface px-3 py-2 text-xs font-medium text-warning">
              Awaiting payment
            </span>
          )}
          <Link
            href={`/therapist/bookings/${booking.id}`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-xs font-medium text-primary/70 transition-colors hover:bg-primary/5 hover:text-primary"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            View booking
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Empty state when there is no upcoming session. */
export function NoUpcomingSession() {
  return (
    <section
      aria-label="No upcoming session"
      className="rounded-xl border border-dashed border-hairline bg-white px-5 py-8 text-center shadow-sm"
    >
      <CalendarDays className="mx-auto h-5 w-5 text-primary/35" aria-hidden="true" />
      <h3 className="mt-2 text-sm font-medium text-primary">No active sessions on the horizon</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
        When a session is confirmed it will appear here with its meeting controls.
      </p>
    </section>
  );
}
