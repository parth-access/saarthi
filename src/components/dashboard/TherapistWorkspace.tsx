'use client';

/**
 * Therapist-facing workspace.
 *
 * This deliberately shares the admin console's structural language (persistent
 * rail, compact context header, clear reading states, restrained white panels),
 * but not its information architecture. A practitioner sees only their own
 * sessions and availability controls; operations, payments, other therapists
 * and platform controls remain outside this component.
 *
 * All state-changing callbacks are owned by AdminPage and passed through to the
 * existing ClinicalSessionCard unchanged. This file changes presentation and
 * local filtering only; it does not read or write Firestore, calculate slots,
 * or make API calls.
 */
import * as React from 'react';
import { format, isToday, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react';
import type { Booking, BookingStatus, Therapist } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ClinicalSessionCard } from './TherapistDashboard';

type WorkspaceTab = 'today' | 'sessions' | 'availability';

interface TherapistWorkspaceProps {
  readonly therapist: Therapist | null;
  readonly bookings: readonly Booking[];
  readonly loading: boolean;
  readonly error?: string;
  readonly onRefresh: () => void;
  readonly onLogout: () => void;
  readonly onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  readonly onDeclineRequest: (booking: Booking) => void;
  readonly processingId: string | null;
  readonly scheduleBuilderNode?: React.ReactNode;
}

function isTodaysBooking(booking: Booking): boolean {
  if (!booking.date) return false;
  try {
    return isToday(parseISO(booking.date));
  } catch {
    return false;
  }
}

function sessionDate(booking: Booking): Date | null {
  if (!booking.date) return null;
  try {
    const value = parseISO(booking.date);
    return Number.isNaN(value.getTime()) ? null : value;
  } catch {
    return null;
  }
}

function initialsFor(name: string | undefined): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean).slice(0, 2) ?? [];
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'T';
}

const NAV: readonly { readonly id: WorkspaceTab; readonly label: string; readonly icon: React.ElementType }[] = [
  { id: 'today', label: 'Today', icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', icon: CalendarDays },
  { id: 'availability', label: 'Availability', icon: Clock3 },
];

export function TherapistWorkspace({
  therapist,
  bookings,
  loading,
  error,
  onRefresh,
  onLogout,
  onUpdateStatus,
  onDeclineRequest,
  processingId,
  scheduleBuilderNode,
}: TherapistWorkspaceProps) {
  const [tab, setTab] = React.useState<WorkspaceTab>('today');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<BookingStatus | 'all'>('all');

  const today = React.useMemo(() => bookings.filter(isTodaysBooking), [bookings]);
  const pending = React.useMemo(
    () => bookings.filter((booking) => booking.status === 'pending' || booking.status === 'pending_approval'),
    [bookings]
  );
  const upcoming = React.useMemo(
    () =>
      bookings
        .filter((booking) => {
          const date = sessionDate(booking);
          return Boolean(
            date &&
              !isTodaysBooking(booking) &&
              date.getTime() >= new Date().setHours(0, 0, 0, 0) &&
              (booking.status === 'confirmed' || booking.status === 'awaiting_payment')
          );
        })
        .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`)),
    [bookings]
  );
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return bookings.filter((booking) => {
      const matchesStatus = status === 'all' || booking.status === status;
      const matchesQuery =
        !needle ||
        [booking.name, booking.email, booking.phone, booking.sessionType].some((value) =>
          (value ?? '').toLocaleLowerCase().includes(needle)
        );
      return matchesStatus && matchesQuery;
    });
  }, [bookings, query, status]);

  const selectTab = (next: WorkspaceTab) => {
    setTab(next);
    setDrawerOpen(false);
  };
  const name = therapist?.name || 'Your practice';
  const firstName = name.split(/\s+/)[0] || 'there';
  const currentLabel = NAV.find((item) => item.id === tab)?.label ?? 'Today';

  return (
    <div className="admin-dense min-h-screen bg-background text-primary">
      <a
        href="#therapist-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
      >
        Skip to workspace
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-neutral-surface/60 px-3 py-4 lg:flex">
        <WorkspaceBrand />
        <WorkspaceNav tab={tab} sessionCount={bookings.length} onSelect={selectTab} />
        <ProfileRail therapist={therapist} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 h-full w-full bg-primary/20 backdrop-blur-sm"
          />
          <aside className="relative flex h-full w-64 max-w-[82%] flex-col border-r border-hairline bg-background px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between">
              <WorkspaceBrand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-primary/60 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <WorkspaceNav tab={tab} sessionCount={bookings.length} onSelect={selectTab} />
            <ProfileRail therapist={therapist} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-hairline bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex min-h-16 items-center gap-3 px-4 py-3 lg:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="-ml-1 rounded-lg p-2 text-primary/70 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-serif text-lg font-semibold text-primary">{currentLabel}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {tab === 'today'
                  ? 'Your schedule, requests and next sessions.'
                  : tab === 'sessions'
                    ? 'Your own client sessions and their current state.'
                    : 'The hours that determine when clients can book you.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="shrink-0">
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
              <span className="hidden sm:inline">{loading ? 'Reading…' : 'Refresh'}</span>
              <span className="sm:hidden">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout} className="hidden text-muted-foreground hover:bg-danger-surface hover:text-danger sm:inline-flex">
              <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </header>

        <main id="therapist-content" className="mx-auto max-w-7xl px-4 py-5 lg:px-6">
          {error && (
            <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-surface px-4 py-3 text-xs text-danger shadow-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p><span className="font-semibold">Couldn’t refresh this workspace.</span> {error} The information already shown is still available.</p>
            </div>
          )}

          {tab === 'today' && (
            <TodayView
              firstName={firstName}
              therapist={therapist}
              bookings={bookings}
              today={today}
              pending={pending}
              upcoming={upcoming}
              processingId={processingId}
              onUpdateStatus={onUpdateStatus}
              onDeclineRequest={onDeclineRequest}
              onOpenSessions={() => selectTab('sessions')}
              onOpenAvailability={() => selectTab('availability')}
            />
          )}
          {tab === 'sessions' && (
            <SessionsView
              bookings={filtered}
              query={query}
              status={status}
              processingId={processingId}
              onQuery={setQuery}
              onStatus={setStatus}
              onUpdateStatus={onUpdateStatus}
              onDeclineRequest={onDeclineRequest}
            />
          )}
          {tab === 'availability' && (
            <section className="space-y-3">
              <SectionHeading title="Availability" detail="Set your recurring hours and closed dates. These are the times clients can request." />
              {scheduleBuilderNode ?? <EmptyPanel title="Your availability is not ready" detail="A therapist profile is needed before working hours can be loaded." />}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function WorkspaceBrand() {
  return (
    <div className="flex items-baseline gap-2 px-2.5 py-1">
      <span className="font-serif text-base font-semibold text-primary">Saarthi</span>
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent">Therapist</span>
    </div>
  );
}

function WorkspaceNav({ tab, sessionCount, onSelect }: { tab: WorkspaceTab; sessionCount: number; onSelect: (tab: WorkspaceTab) => void }) {
  return (
    <nav aria-label="Therapist workspace" className="mt-6 flex flex-col gap-0.5">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              active ? 'bg-white text-primary shadow-sm ring-1 ring-primary/10' : 'text-primary/70 hover:bg-white/60 hover:text-primary'
            )}
          >
            <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-primary/45')} aria-hidden="true" />
            <span>{label}</span>
            {id === 'sessions' && <span className="ml-auto text-[0.6875rem] tabular-nums text-muted-foreground">{sessionCount}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function ProfileRail({ therapist }: { therapist: Therapist | null }) {
  return (
    <div className="mt-auto border-t border-hairline px-2.5 pt-4">
      <div className="flex items-center gap-2.5">
        {therapist?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={therapist.image} alt="" className="h-8 w-8 rounded-lg border border-hairline object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initialsFor(therapist?.name)}</span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-primary">{therapist?.name ?? 'Therapist'}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">{therapist?.specialization ?? 'Clinical workspace'}</p>
        </div>
      </div>
    </div>
  );
}

function TodayView({ firstName, therapist, bookings, today, pending, upcoming, processingId, onUpdateStatus, onDeclineRequest, onOpenSessions, onOpenAvailability }: {
  firstName: string; therapist: Therapist | null; bookings: readonly Booking[]; today: readonly Booking[]; pending: readonly Booking[]; upcoming: readonly Booking[]; processingId: string | null;
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>; onDeclineRequest: (booking: Booking) => void; onOpenSessions: () => void; onOpenAvailability: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-hairline bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-accent">Clinical workspace</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-primary">Good day, {firstName}.</h2>
            <p className="mt-1 text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMMM d')} · all session times are IST.</p>
          </div>
          <div className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium', therapist ? (therapist.active ? 'border-success/20 bg-success-surface text-success' : 'border-danger/20 bg-danger-surface text-danger') : 'border-warning/20 bg-warning-surface text-warning')}>
            {!therapist ? 'Profile unavailable' : therapist.active ? 'Profile active' : 'Profile inactive'}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat title="Today" value={today.length} detail={today.length === 1 ? 'session planned' : 'sessions planned'} icon={Clock3} />
        <Stat title="Needs a reply" value={pending.length} detail="new session requests" icon={AlertTriangle} tone={pending.length > 0 ? 'warning' : 'default'} />
        <Stat title="Ahead" value={upcoming.length} detail="upcoming active sessions" icon={CalendarDays} />
      </div>

      {pending.length > 0 && (
        <section className="rounded-xl border border-warning/30 bg-warning-surface px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-warning"><span className="font-semibold">{pending.length} request{pending.length === 1 ? '' : 's'} need your response.</span> Reviewing a request sends its payment link only when you choose to approve it.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onOpenSessions} className="border-warning/30 bg-white text-warning hover:bg-white/80">Review requests</Button>
          </div>
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <section>
            <SectionHeading title="Today’s sessions" detail={today.length === 0 ? 'Your diary is clear.' : `${today.length} session${today.length === 1 ? '' : 's'} scheduled today.`} />
            <div className="mt-3 space-y-3">
              {today.length === 0 ? <EmptyPanel title="No sessions today" detail="Use availability to keep your next bookable hours current." actionLabel="Manage availability" onAction={onOpenAvailability} /> : today.map((booking) => <ClinicalSessionCard key={booking.id} booking={booking} isTodaySession isProcessing={processingId === booking.id} onUpdateStatus={onUpdateStatus} onDeclineRequest={onDeclineRequest} />)}
            </div>
          </section>
          <section>
            <SectionHeading title="Upcoming" detail="Confirmed and awaiting-payment sessions after today." actionLabel="All sessions" onAction={onOpenSessions} />
            <div className="mt-3 space-y-3">
              {upcoming.length === 0 ? <EmptyPanel title="Nothing upcoming yet" detail="New confirmed sessions will appear here." /> : upcoming.slice(0, 5).map((booking) => <ClinicalSessionCard key={booking.id} booking={booking} isProcessing={processingId === booking.id} onUpdateStatus={onUpdateStatus} onDeclineRequest={onDeclineRequest} />)}
            </div>
          </section>
        </div>
        <aside className="space-y-3 xl:sticky xl:top-20">
          <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2.5"><span className="rounded-lg bg-primary/5 p-2 text-primary"><Stethoscope className="h-4 w-4" aria-hidden="true" /></span><div><h3 className="text-sm font-semibold text-primary">Your practice</h3><p className="text-xs text-muted-foreground">Personal session workspace</p></div></div>
            <dl className="mt-4 space-y-2 border-t border-hairline pt-3 text-xs"><Detail label="Standard session" value="45 minutes" /><Detail label="Session timezone" value="IST (UTC+5:30)" /><Detail label="Visible sessions" value={String(bookings.length)} /></dl>
          </section>
          <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm"><h3 className="text-sm font-semibold text-primary">Keep availability current</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your saved hours determine which start times clients can request.</p><Button variant="outline" size="sm" onClick={onOpenAvailability} className="mt-3 w-full"><Clock3 className="mr-1.5 h-3.5 w-3.5" />Manage availability</Button></section>
        </aside>
      </div>
    </div>
  );
}

function SessionsView({ bookings, query, status, processingId, onQuery, onStatus, onUpdateStatus, onDeclineRequest }: { bookings: readonly Booking[]; query: string; status: BookingStatus | 'all'; processingId: string | null; onQuery: (value: string) => void; onStatus: (value: BookingStatus | 'all') => void; onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>; onDeclineRequest: (booking: Booking) => void }) {
  return <section className="space-y-3"><SectionHeading title="Sessions" detail="Search and manage the sessions assigned to you." /><div className="rounded-xl border border-hairline bg-white p-3 shadow-sm sm:flex sm:items-center sm:gap-3"><label className="sr-only" htmlFor="session-search">Search sessions</label><input id="session-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search client, email, phone or session type" className="h-10 w-full rounded-lg border border-hairline bg-neutral-surface/40 px-3 text-sm text-primary placeholder:text-muted-foreground focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 sm:flex-1" /><label className="sr-only" htmlFor="session-status">Filter by status</label><select id="session-status" value={status} onChange={(event) => onStatus(event.target.value as BookingStatus | 'all')} className="mt-2 h-10 w-full rounded-lg border border-hairline bg-white px-3 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:mt-0 sm:w-52"><option value="all">All statuses</option><option value="pending_approval">Pending approval</option><option value="awaiting_payment">Awaiting payment</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="rejected">Rejected</option></select></div><div className="space-y-3">{bookings.length === 0 ? <EmptyPanel title="No matching sessions" detail="Try changing the search or status filter." /> : bookings.map((booking) => <ClinicalSessionCard key={booking.id} booking={booking} isProcessing={processingId === booking.id} onUpdateStatus={onUpdateStatus} onDeclineRequest={onDeclineRequest} />)}</div></section>;
}

function SectionHeading({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) { return <div className="flex flex-wrap items-end justify-between gap-2 border-b border-hairline pb-2.5"><div><h2 className="font-serif text-base font-semibold text-primary">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div>{actionLabel && onAction && <Button variant="ghost" size="sm" onClick={onAction} className="text-primary">{actionLabel}</Button>}</div>; }
function EmptyPanel({ title, detail, actionLabel, onAction }: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) { return <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-8 text-center shadow-sm"><UsersRound className="mx-auto h-5 w-5 text-primary/35" aria-hidden="true" /><h3 className="mt-2 text-sm font-medium text-primary">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{detail}</p>{actionLabel && onAction && <Button variant="outline" size="sm" onClick={onAction} className="mt-3">{actionLabel}</Button>}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 text-muted-foreground"><dt>{label}</dt><dd className="font-medium text-primary">{value}</dd></div>; }
function Stat({ title, value, detail, icon: Icon, tone = 'default' }: { title: string; value: number; detail: string; icon: React.ElementType; tone?: 'default' | 'warning' }) { return <section className={cn('rounded-xl border p-4 shadow-sm', tone === 'warning' ? 'border-warning/25 bg-warning-surface' : 'border-hairline bg-white')}><div className="flex items-center justify-between"><p className={cn('text-[0.6875rem] font-semibold uppercase tracking-[0.08em]', tone === 'warning' ? 'text-warning' : 'text-primary/55')}>{title}</p><Icon className={cn('h-4 w-4', tone === 'warning' ? 'text-warning' : 'text-primary/45')} aria-hidden="true" /></div><p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-primary">{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></section>; }
