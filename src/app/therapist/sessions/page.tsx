"use client";

/**
 * All Sessions page — the "master ledger" for the therapist.
 *
 * Reuses ClinicalSessionCard for full inline detail (the same component the
 * existing TherapistWorkspace used). This is where search/filter makes sense;
 * the dashboard is the overview.
 */
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ClinicalSessionCard } from '@/components/dashboard/TherapistDashboard';
import { useTherapistData } from '../layout';
import { isToday, parseISO } from 'date-fns';
import type { Booking, BookingStatus } from '@/types';
import { useBookingActions } from '@/hooks/useTherapistDashboard';
import { parseSessionView, sessionsForView } from '@/components/therapist/dashboard/sessionView';

function isTodaysBooking(b: Booking): boolean {
  if (!b.date) return false;
  try { return isToday(parseISO(b.date)); } catch { return false; }
}

function TherapistSessionsContent() {
  const data = useTherapistData();
  const searchParams = useSearchParams();
  const view = parseSessionView(searchParams.get('view'));
  const [, setBookings] = React.useState(data.bookings);
  const { processingId, updateStatus } = useBookingActions(setBookings);

  const [query, setQuery] = React.useState('');
  const [statusChoice, setStatusChoice] = React.useState<{ view: string; status: BookingStatus | 'all' }>({ view, status: 'all' });
  const statusFilter = statusChoice.view === view ? statusChoice.status : 'all';

  // Decline modal state
  const [, setDeclineTarget] = React.useState<Booking | null>(null);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sessionsForView(data.bookings, view, data.upcomingSessions).filter((b) => {
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesQuery =
        !needle ||
        [b.name, b.email, b.phone, b.sessionType].some((v) =>
          (v ?? '').toLocaleLowerCase().includes(needle)
        );
      return matchesStatus && matchesQuery;
    });
  }, [data.bookings, data.upcomingSessions, view, query, statusFilter]);

  const stillLoading = data.loading && data.bookings.length === 0;

  return (
    <section className="space-y-3">
      {view !== 'all' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-white px-4 py-2 text-sm text-primary">
          <span>Showing {view === 'requests' ? 'requests awaiting review' : view === 'upcoming' ? 'upcoming sessions' : 'session history'}</span>
          <Link href="/therapist/sessions" className="font-medium underline underline-offset-2">Show all sessions</Link>
        </div>
      )}
      {/* Filter bar */}
      <div className="rounded-xl border border-hairline bg-white p-3 shadow-sm sm:flex sm:items-center sm:gap-3">
        <label className="sr-only" htmlFor="session-search">Search sessions</label>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <input
            id="session-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, email, phone or session type"
            className="h-10 w-full rounded-lg border border-hairline bg-neutral-surface/40 pl-9 pr-3 text-sm text-primary placeholder:text-muted-foreground focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <label className="sr-only" htmlFor="session-status">Filter by status</label>
        <div className="relative mt-2 sm:mt-0 sm:w-52">
          <select
            id="session-status"
            value={statusFilter}
             onChange={(e) => setStatusChoice({ view, status: e.target.value as BookingStatus | 'all' })}
            className="h-10 w-full rounded-lg border border-hairline bg-white px-3 pr-8 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
          >
            <option value="all">All statuses</option>
            <option value="pending_approval">Pending approval</option>
            <option value="awaiting_payment">Awaiting payment</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
            <option value="no_show">No-show</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {(query || statusFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setQuery(''); setStatusChoice({ view, status: 'all' }); }}
            className="mt-2 text-xs text-muted-foreground sm:mt-0"
          >
            Clear filters
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing <strong className="text-primary">{filtered.length}</strong> of {sessionsForView(data.bookings, view, data.upcomingSessions).length} sessions in this view
      </p>

      {/* Sessions list */}
      {stillLoading ? (
        <div className="space-y-3" aria-busy="true">
          <span className="sr-only">Loading your sessions…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-sm motion-reduce:animate-none" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-8 text-center shadow-sm">
              <p className="text-sm font-medium text-primary">No matching sessions</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {query || statusFilter !== 'all'
                  ? 'Try changing the search or status filter.'
                  : 'When clients book with you, their sessions will appear here.'}
              </p>
            </div>
          ) : (
            filtered.map((b) => (
              <ClinicalSessionCard
                key={b.id}
                booking={b}
                isTodaySession={isTodaysBooking(b)}
                isProcessing={processingId === b.id}
                onUpdateStatus={updateStatus}
                onDeclineRequest={setDeclineTarget}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

export default function TherapistSessionsPage() {
  return (
    <React.Suspense fallback={<p className="text-sm text-muted-foreground">Loading sessions…</p>}>
      <TherapistSessionsContent />
    </React.Suspense>
  );
}
