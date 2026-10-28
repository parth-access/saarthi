"use client";

/**
 * All Sessions page — the "master ledger" for the therapist.
 *
 * Reuses ClinicalSessionCard for full inline detail (the same component the
 * original combined workspace used). This is where search/filter makes sense;
 * the dashboard is the overview.
 */
import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ClinicalSessionCard } from '@/components/therapist/ClinicalSessionCard';
import { useTherapistData } from '@/components/therapist/TherapistDataContext';
import { isToday, parseISO } from 'date-fns';
import type { Booking, BookingStatus } from '@/types';
import { useBookingActions } from '@/hooks/useTherapistDashboard';
import { orderSessions, parseSessionView, sessionsForView, type SessionView } from '@/components/therapist/dashboard/sessionView';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { toast } from 'sonner';

const DECLINE_REASONS = [
  'Not available at this time',
  'Outside my area of practice',
  'Client needs a different level of care',
  'Other',
] as const;

const VIEW_TABS: readonly { view: SessionView; label: string }[] = [
  { view: 'all', label: 'All' },
  { view: 'requests', label: 'Requests' },
  { view: 'upcoming', label: 'Upcoming' },
  { view: 'history', label: 'Past' },
];

/** Status changes that are hard to undo get an explicit confirmation step. */
const CONFIRM_COPY: Partial<Record<BookingStatus, { title: string; body: string; cta: string }>> = {
  cancelled: {
    title: 'Cancel this session?',
    body: 'The client is notified and a refund is issued under the cancellation policy. This cannot be undone.',
    cta: 'Cancel session',
  },
  no_show: {
    title: 'Mark as no-show?',
    body: "Use this when the client didn't attend. The session is closed without a refund.",
    cta: "Mark no-show",
  },
};

const SUCCESS_COPY: Partial<Record<BookingStatus, string>> = {
  completed: 'Session marked as completed.',
  cancelled: 'Session cancelled.',
  no_show: 'Session marked as no-show.',
};

function isTodaysBooking(b: Booking): boolean {
  if (!b.date) return false;
  try { return isToday(parseISO(b.date)); } catch { return false; }
}

function TherapistSessionsContent() {
  const data = useTherapistData();
  const searchParams = useSearchParams();
  const view = parseSessionView(searchParams.get('view'));
  const { processingId, updateStatus, declineBooking } = useBookingActions(data.refresh);

  const [query, setQuery] = React.useState('');
  const [statusChoice, setStatusChoice] = React.useState<{ view: string; status: BookingStatus | 'all' }>({ view, status: 'all' });
  const statusFilter = statusChoice.view === view ? statusChoice.status : 'all';

  // Decline modal state
  const [declineTarget, setDeclineTarget] = React.useState<Booking | null>(null);
  const [declineReason, setDeclineReason] = React.useState<string>(DECLINE_REASONS[0]);
  const [declineNote, setDeclineNote] = React.useState('');

  // Confirmation for cancel / no-show
  const [confirmTarget, setConfirmTarget] = React.useState<{ id: string; status: BookingStatus } | null>(null);

  const runStatusUpdate = React.useCallback(async (id: string, status: BookingStatus) => {
    try {
      await updateStatus(id, status);
      toast.success(SUCCESS_COPY[status] ?? 'Session updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the session.');
    }
  }, [updateStatus]);

  const handleUpdateStatus = React.useCallback(async (id: string, status: BookingStatus) => {
    if (CONFIRM_COPY[status]) {
      setConfirmTarget({ id, status });
      return;
    }
    await runStatusUpdate(id, status);
  }, [runStatusUpdate]);

  const openDecline = React.useCallback((b: Booking) => {
    setDeclineReason(DECLINE_REASONS[0]);
    setDeclineNote('');
    setDeclineTarget(b);
  }, []);

  const submitDecline = async () => {
    if (!declineTarget) return;
    if (declineReason === 'Other' && !declineNote.trim()) {
      toast.error('Please add a short note for the client.');
      return;
    }
    try {
      await declineBooking(declineTarget.id, declineReason, declineNote.trim() || undefined);
      toast.success('Request declined. The client has been notified.');
      setDeclineTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline the session.');
    }
  };

  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const viewCounts = React.useMemo(
    () =>
      Object.fromEntries(
        VIEW_TABS.map((tab) => [tab.view, sessionsForView(data.bookings, tab.view, data.upcomingSessions).length])
      ) as Record<SessionView, number>,
    [data.bookings, data.upcomingSessions]
  );

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return orderSessions(sessionsForView(data.bookings, view, data.upcomingSessions), today).filter((b) => {
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesQuery =
        !needle ||
        [b.name, b.email, b.phone, b.sessionType].some((v) =>
          (v ?? '').toLocaleLowerCase().includes(needle)
        );
      return matchesStatus && matchesQuery;
    });
  }, [data.bookings, data.upcomingSessions, view, query, statusFilter, today]);

  const stillLoading = data.loading && data.bookings.length === 0;

  return (
    <section className="space-y-3">
      <nav aria-label="Session views" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {VIEW_TABS.map((tab) => {
          const active = tab.view === view;
          return (
            <Link
              key={tab.view}
              href={tab.view === 'all' ? '/therapist/sessions' : `/therapist/sessions?view=${tab.view}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-hairline bg-white text-primary/70 hover:border-primary/30 hover:text-primary'
              )}
            >
              {tab.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  active ? 'bg-white/20 text-white' : tab.view === 'requests' && viewCounts.requests > 0 ? 'bg-warning-surface text-warning' : 'bg-neutral-surface text-muted-foreground'
                )}
              >
                {viewCounts[tab.view]}
              </span>
            </Link>
          );
        })}
      </nav>
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
                onUpdateStatus={handleUpdateStatus}
                onDeclineRequest={openDecline}
              />
            ))
          )}
        </div>
      )}

      <Modal
        isOpen={declineTarget !== null}
        onClose={() => setDeclineTarget(null)}
        title="Decline session request"
      >
        <div className="space-y-4 text-sm">
          {declineTarget && (
            <p className="text-muted-foreground">
              {declineTarget.name || 'This client'} · {declineTarget.date} {declineTarget.time}
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="font-medium text-primary mb-1">Reason</legend>
            {DECLINE_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decline-reason"
                  value={r}
                  checked={declineReason === r}
                  onChange={() => setDeclineReason(r)}
                />
                {r}
              </label>
            ))}
          </fieldset>
          <div>
            <label htmlFor="decline-note" className="font-medium text-primary">
              Note to client {declineReason === 'Other' ? '(required)' : '(optional)'}
            </label>
            <textarea
              id="decline-note"
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-lg border border-hairline p-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeclineTarget(null)}>
              Keep request
            </Button>
            <Button
              type="button"
              onClick={submitDecline}
              disabled={processingId === declineTarget?.id}
              className="bg-danger text-white hover:bg-danger/90"
            >
              Decline request
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget ? CONFIRM_COPY[confirmTarget.status]?.title ?? 'Confirm' : 'Confirm'}
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {confirmTarget ? CONFIRM_COPY[confirmTarget.status]?.body : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmTarget(null)}>
              Go back
            </Button>
            <Button
              type="button"
              disabled={processingId === confirmTarget?.id}
              onClick={async () => {
                if (!confirmTarget) return;
                const t = confirmTarget;
                setConfirmTarget(null);
                await runStatusUpdate(t.id, t.status);
              }}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {confirmTarget ? CONFIRM_COPY[confirmTarget.status]?.cta : 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>
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
