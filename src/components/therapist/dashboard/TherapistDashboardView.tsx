'use client';

/**
 * Therapist dashboard view — the render-only component.
 *
 * This is the "Today" view that answers: "What do I need to know and do for my
 * sessions?" It receives all data through props so it can be tested without
 * network calls or auth context.
 *
 * Section order (mobile priority):
 * 1. Header (greeting + date)
 * 2. Next Session hero
 * 3. Quick stats
 * 4. Today's sessions
 * 5. Pending requests (if any)
 * 6. Needs attention (post-session)
 * 7. Upcoming sessions
 * 8. Recent sessions
 */
import Link from 'next/link';
import * as React from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Clock3,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { formatSessionDay } from '@/components/admin/bookings/adminBookingPresentation';
import { NextSessionHero, NoUpcomingSession } from './NextSessionHero';
import { PostSessionAttention, PostSessionAllClear } from './PostSessionAttention';
import { TherapistSessionRow } from './TherapistSessionRow';
import type { Booking, Therapist } from '@/types';

interface TherapistDashboardViewProps {
  readonly therapist: Therapist | null;
  readonly todaySessions: readonly Booking[];
  readonly nextSession: Booking | null;
  readonly pendingRequests: readonly Booking[];
  readonly upcomingSessions: readonly Booking[];
  readonly recentSessions: readonly Booking[];
  readonly needsAttention: readonly Booking[];
  readonly stats: {
    today: number;
    pending: number;
    upcoming: number;
    attention: number;
  };
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// --- Reusable primitives (matching admin console's visual weight) ---

function Stat({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  title: string;
  value: number;
  detail: string;
  icon: React.ElementType;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 shadow-sm',
        tone === 'warning' ? 'border-warning/25 bg-warning-surface' : 'border-hairline bg-white'
      )}
    >
      <div className="flex items-center justify-between">
        <p
          className={cn(
            'text-[0.6875rem] font-semibold uppercase tracking-[0.08em]',
            tone === 'warning' ? 'text-warning' : 'text-primary/55'
          )}
        >
          {title}
        </p>
        <Icon
          className={cn('h-4 w-4', tone === 'warning' ? 'text-warning' : 'text-primary/45')}
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-primary">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SectionHeading({
  title,
  detail,
  actionLabel,
  actionHref,
}: {
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-hairline pb-2.5">
      <div>
        <h2 className="font-serif text-base font-semibold text-primary">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary/60 hover:text-primary"
        >
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-6 text-center shadow-sm">
      <p className="text-sm font-medium text-primary">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

// --- Upcoming sessions grouped by date ---

function groupByDate(sessions: readonly Booking[]): Map<string, Booking[]> {
  const groups = new Map<string, Booking[]>();
  for (const b of sessions) {
    const key = b.date || 'Unknown';
    const group = groups.get(key);
    if (group) {
      group.push(b);
    } else {
      groups.set(key, [b]);
    }
  }
  return groups;
}

export function TherapistDashboardView({
  therapist,
  todaySessions,
  nextSession,
  pendingRequests,
  upcomingSessions,
  recentSessions,
  needsAttention,
  stats,
}: TherapistDashboardViewProps) {
  const firstName = therapist?.name?.split(/\s+/)[0] || 'there';

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <section className="rounded-xl border border-hairline bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-accent">Clinical workspace</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-primary">
              {greetingFor(new Date())}, {firstName}.
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d')} · your sessions and schedule for today.
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs font-medium',
              therapist
                ? therapist.active
                  ? 'border-success/20 bg-success-surface text-success'
                  : 'border-danger/20 bg-danger-surface text-danger'
                : 'border-warning/20 bg-warning-surface text-warning'
            )}
          >
            {!therapist ? 'Profile unavailable' : therapist.active ? 'Profile active' : 'Profile inactive'}
          </div>
        </div>
      </section>

      {/* 2. Next session hero */}
      {nextSession ? (
        <NextSessionHero booking={nextSession} />
      ) : (
        <NoUpcomingSession />
      )}

      {/* 3. Quick stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Today"
          value={stats.today}
          detail={stats.today === 1 ? 'session planned' : 'sessions planned'}
          icon={Clock3}
        />
        <Stat
          title="Needs reply"
          value={stats.pending}
          detail="session requests"
          icon={AlertTriangle}
          tone={stats.pending > 0 ? 'warning' : 'default'}
        />
        <Stat
          title="Upcoming"
          value={stats.upcoming}
          detail="future sessions"
          icon={CalendarDays}
        />
        <Stat
          title="Needs attention"
          value={stats.attention}
          detail="post-session work"
          icon={Stethoscope}
          tone={stats.attention > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* 4. Pending requests banner */}
      {pendingRequests.length > 0 && (
        <section className="rounded-xl border border-warning/30 bg-warning-surface px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-warning">
                <span className="font-semibold">
                  {pendingRequests.length} request{pendingRequests.length === 1 ? '' : 's'} need your response.
                </span>{' '}
                Review requests in the Sessions tab.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-warning/30 bg-white text-warning hover:bg-white/80"
            >
              <Link href="/therapist/sessions?view=requests">Review requests</Link>
            </Button>
          </div>
        </section>
      )}

      {/* 5. Today's sessions */}
      <section className="space-y-3">
        <SectionHeading
          title="Today's sessions"
          detail={
            todaySessions.length === 0
              ? 'Your diary is clear.'
              : `${todaySessions.length} session${todaySessions.length === 1 ? '' : 's'} scheduled today.`
          }
        />
        <div className="space-y-2">
          {todaySessions.length === 0 ? (
            <EmptyPanel
              title="No sessions today"
              detail="Your schedule is clear for today."
            />
          ) : (
            todaySessions.map((b) => (
              <TherapistSessionRow key={b.id} booking={b} isToday />
            ))
          )}
        </div>
      </section>

      {/* 6. Post-session attention */}
      {needsAttention.length > 0 ? (
        <PostSessionAttention sessions={needsAttention} />
      ) : (
        <PostSessionAllClear />
      )}

      {/* 7. Upcoming sessions (grouped by date) */}
      <section className="space-y-3">
        <SectionHeading
          title="Upcoming"
          detail="Confirmed and awaiting-payment sessions after today."
          actionLabel="All sessions"
           actionHref="/therapist/sessions?view=upcoming"
        />
        {upcomingSessions.length === 0 ? (
          <EmptyPanel
            title="Nothing upcoming yet"
            detail="New confirmed sessions will appear here."
          />
        ) : (
          <div className="space-y-4">
            {Array.from(groupByDate(upcomingSessions.slice(0, 10))).map(([date, bookings]) => (
              <div key={date} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/50">
                  {formatSessionDay(date)}
                </p>
                {bookings.map((b) => (
                  <TherapistSessionRow key={b.id} booking={b} />
                ))}
              </div>
            ))}
            {upcomingSessions.length > 10 && (
              <Link
                 href="/therapist/sessions?view=upcoming"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary/60 hover:text-primary"
              >
                View all {upcomingSessions.length} upcoming
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </section>

      {/* 8. Recent sessions */}
      {recentSessions.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            title="Recent sessions"
            detail="Your most recent completed and closed sessions."
            actionLabel="Session history"
             actionHref="/therapist/sessions?view=history"
          />
          <div className="space-y-2">
            {recentSessions.map((b) => (
              <TherapistSessionRow key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}

      {/* 9. Quick actions */}
      <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/therapist/sessions">View all sessions</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/therapist/availability">Manage availability</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
