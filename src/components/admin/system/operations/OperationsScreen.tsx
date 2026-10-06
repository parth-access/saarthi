'use client';

/**
 * The Operations screen — the control room's replacement, tabbed into the three
 * things it actually did:
 *
 *  1. **Health** — real queue counts (exact `count()` aggregations), the
 *     configuration checks, and the machinery's daily counters with their
 *     honesty labels. Everything hardcoded in the legacy room (184 ms dispatch,
 *     DLQ 0, "Live Streaming", a version string) is absent because it was absent
 *     in fact.
 *  2. **Trace & search** — the bounded correlation search, its stitched chain,
 *     and the re-drive actions, each behind a confirmation the legacy room never
 *     had.
 *  3. **Timeline** — the recent rows with actor, severity and the pills that
 *     jump to a trace or a search.
 */
import * as React from 'react';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  actorLabel,
  configurationCheck,
  CORRELATION_SLICE_BOUND,
  correlationChain,
  METRICS_CAVEAT,
  severityBadge,
  type BookingHit,
  type TimelineRow,
} from '@/domains/admin/operationsTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  humanizeStatus,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { CopyableId } from '../../bookings/CopyableId';
import { ConfirmDialog } from '../../ConfirmDialog';
import { interpretReplayActionResponse } from '../jobs/replayResponse';
import { interpretCalendarRetryResponse } from '../calendar/calendarRetryResponse';
import { useAdminOperations, useOperationsSearch } from './useAdminOperations';

type Tab = 'health' | 'trace' | 'timeline';

type PendingAction =
  | { readonly kind: 'replay-event'; readonly eventName: string; readonly bookingId: string }
  | { readonly kind: 'calendar'; readonly bookingId: string }
  | { readonly kind: 'resend'; readonly emailId: string; readonly recipient: string };

interface ActionBanner {
  readonly tone: AdminTone;
  readonly text: string;
}

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'health', label: 'Health' },
  { id: 'trace', label: 'Trace & search' },
  { id: 'timeline', label: 'Timeline' },
];

export function OperationsScreen() {
  const { data, loading, initialLoading, error, reload } = useAdminOperations();
  const search = useOperationsSearch();
  const [tab, setTab] = useState<Tab>('health');
  const [term, setTerm] = useState('');
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);
  const [banner, setBanner] = useState<ActionBanner | null>(null);

  if (initialLoading) return <OperationsSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  async function performAction() {
    if (!pending || acting) return;
    setActing(true);
    try {
      let response: Response;
      let interpret: (status: number, body: unknown) => { ok: true; summary: string } | { ok: false; error: string; indeterminate: boolean };
      if (pending.kind === 'calendar') {
        response = await fetchWithAuth('/api/admin/calendar/retry', {
          method: 'POST',
          body: JSON.stringify({ bookingId: pending.bookingId }),
        });
        interpret = (status, body) => {
          const result = interpretCalendarRetryResponse(status, body);
          return result.ok
            ? { ok: true, summary: result.summary }
            : { ok: false, error: result.error, indeterminate: result.indeterminate };
        };
      } else if (pending.kind === 'resend') {
        response = await fetchWithAuth('/api/email/resend', {
          method: 'POST',
          body: JSON.stringify({ emailId: pending.emailId }),
        });
        interpret = (status, body) => {
          const result = interpretReplayActionResponse(status, body);
          return result.ok
            ? { ok: true, summary: result.summary }
            : { ok: false, error: result.error, indeterminate: result.indeterminate };
        };
      } else {
        response = await fetchWithAuth('/api/operations/replay', {
          method: 'POST',
          body: JSON.stringify({
            action: 'replay_event',
            bookingId: pending.bookingId,
            eventName: pending.eventName,
          }),
        });
        interpret = (status, body) => {
          const result = interpretReplayActionResponse(status, body);
          return result.ok
            ? { ok: true, summary: result.summary }
            : { ok: false, error: result.error, indeterminate: result.indeterminate };
        };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const result = interpret(response.status, body);
      setBanner(
        result.ok
          ? { tone: 'success', text: `${result.summary} Reload to see the effect.` }
          : { tone: 'warning', text: result.error }
      );
      setPending(null);
      reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so it is not known whether the action happened. Reload before doing anything else.',
      });
      setPending(null);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-3">
      <Reading payload={data} loading={loading} onReload={reload} />

      {error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error} What you see below was
          read at {formatCreatedAt(data.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}.
        </Notice>
      )}

      {banner && (
        <Notice tone={banner.tone}>
          <span className="font-medium">Action: </span>
          {banner.text}
        </Notice>
      )}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Operations views">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tab === entry.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-white text-primary/70 ring-1 ring-hairline hover:text-primary'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'health' && <HealthTab payload={data} />}
      {tab === 'trace' && (
        <TraceTab
          payload={data}
          search={search}
          term={term}
          onTerm={setTerm}
          correlationId={correlationId}
          onCorrelation={(id) => {
            setCorrelationId(id);
          }}
          onClearTrace={() => setCorrelationId(null)}
          onSearchBooking={(id) => {
            setTab('trace');
            setTerm(id);
            search.run(id);
          }}
          onAction={setPending}
        />
      )}
      {tab === 'timeline' && (
        <TimelineTab
          rows={data.timelines}
          onCorrelation={(id) => {
            setCorrelationId(id);
            setTab('trace');
          }}
          onSearchBooking={(id) => {
            setTab('trace');
            setTerm(id);
            search.run(id);
          }}
        />
      )}

      {pending?.kind === 'replay-event' && (
        <ReplayEventDialog
          eventName={pending.eventName}
          bookingId={pending.bookingId}
          busy={acting}
          onConfirm={performAction}
          onClose={() => {
            if (!acting) setPending(null);
          }}
        />
      )}
      {pending?.kind === 'calendar' && (
        <CalendarDialog
          bookingId={pending.bookingId}
          busy={acting}
          onConfirm={performAction}
          onClose={() => {
            if (!acting) setPending(null);
          }}
        />
      )}
      {pending?.kind === 'resend' && (
        <ResendDialog
          recipient={pending.recipient}
          busy={acting}
          onConfirm={performAction}
          onClose={() => {
            if (!acting) setPending(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function Reading({
  payload,
  loading,
  onReload,
}: {
  payload: { generatedAtIso: string };
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Operations</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Read at {formatCreatedAt(payload.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}. This page does
          not refresh on its own — the timeline is not live, and a list that moved under a click
          would be a way to act on the wrong row.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reading…' : 'Read again'}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Health tab
 * ------------------------------------------------------------------ */

function HealthTab({ payload }: { payload: { queuedEmailCount: number | null; failedEmailCount: number | null; metrics: readonly { date: string | null; bookingsCreated: number | null; bookingsConfirmed: number | null; paymentsSucceeded: number | null; paymentsFailed: number | null; emailsSent: number | null; emailsFailed: number | null }[]; diagnostics: { resendConfigured: boolean | null; razorpayConfigured: boolean | null; nodeEnv: string | null } } }) {
  const checks = [
    configurationCheck('Email (Resend)', payload.diagnostics.resendConfigured),
    configurationCheck('Payments (Razorpay)', payload.diagnostics.razorpayConfigured),
  ];

  return (
    <div className="space-y-3">
      <Panel
        title="Email queue"
        subtitle="Exact counts, read live from the collection — the same numbers the Background jobs screen lists in detail."
      >
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <CountTile
            label="Queued and waiting"
            value={payload.queuedEmailCount}
            tone={payload.queuedEmailCount === null ? 'neutral' : 'info'}
          />
          <CountTile
            label="Failed, needing a person"
            value={payload.failedEmailCount}
            tone={payload.failedEmailCount === null ? 'neutral' : payload.failedEmailCount > 0 ? 'danger' : 'success'}
          />
        </div>
        {(payload.queuedEmailCount === null || payload.failedEmailCount === null) && (
          <p className="mt-2 text-[0.625rem] leading-relaxed text-muted-foreground">
            A missing count is a failed read, not a zero.
          </p>
        )}
      </Panel>

      <Panel title="Configuration" subtitle="Whether each integration's credentials are present in the environment. Presence is checked, not a live connection.">
        <ul className="mt-2 space-y-1.5">
          {checks.map((check) => (
            <li key={check.label} className="flex flex-wrap items-baseline gap-2">
              <Badge tone={check.tone} label={check.tone === 'danger' ? 'Missing' : 'Configured'} title={check.detail} />
              <span className="text-xs font-medium text-primary">{check.label}</span>
              <span className="text-[0.6875rem] text-muted-foreground">{check.detail}</span>
            </li>
          ))}
          <li className="flex flex-wrap items-baseline gap-2">
            <Badge tone="neutral" label="Runtime" title="The environment this console is served from." />
            <span className="text-xs font-medium text-primary">Environment</span>
            <span className="text-[0.6875rem] text-muted-foreground">{payload.diagnostics.nodeEnv ?? '—'}</span>
          </li>
        </ul>
      </Panel>

      <Panel title="Machinery counters, last seven UTC days" subtitle={METRICS_CAVEAT}>
        {payload.metrics.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No metrics rows came back. They are written by events; a silent platform writes nothing.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">UTC day</th>
                  <th className="py-1.5 pr-3 font-medium">Holds created</th>
                  <th className="py-1.5 pr-3 font-medium">Confirmed</th>
                  <th className="py-1.5 pr-3 font-medium">Payments ok</th>
                  <th className="py-1.5 pr-3 font-medium">Payments failed</th>
                  <th className="py-1.5 pr-3 font-medium">Emails sent</th>
                  <th className="py-1.5 font-medium">Emails failed</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {payload.metrics.map((row, index) => (
                  <tr key={row.date ?? index} className="border-t border-hairline">
                    <td className="py-1.5 pr-3 text-primary">{row.date ?? '—'}</td>
                    <td className="py-1.5 pr-3">{row.bookingsCreated ?? '—'}</td>
                    <td className="py-1.5 pr-3">{row.bookingsConfirmed ?? '—'}</td>
                    <td className="py-1.5 pr-3">{row.paymentsSucceeded ?? '—'}</td>
                    <td className="py-1.5 pr-3">{row.paymentsFailed ?? '—'}</td>
                    <td className="py-1.5 pr-3">{row.emailsSent ?? '—'}</td>
                    <td className="py-1.5">{row.emailsFailed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function CountTile({ label, value, tone }: { label: string; value: number | null; tone: AdminTone }) {
  return (
    <div className="rounded-xl border border-hairline px-3.5 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${toneClasses(tone).split(' ').pop()}`}>
        {value === null ? '—' : value}
      </p>
      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Trace & search tab
 * ------------------------------------------------------------------ */

function TraceTab({
  payload,
  search,
  term,
  onTerm,
  correlationId,
  onCorrelation,
  onClearTrace,
  onSearchBooking,
  onAction,
}: {
  payload: { timelines: readonly TimelineRow[] };
  search: ReturnType<typeof useOperationsSearch>;
  term: string;
  onTerm: (value: string) => void;
  correlationId: string | null;
  onCorrelation: (id: string) => void;
  onClearTrace: () => void;
  onSearchBooking: (id: string) => void;
  onAction: (action: PendingAction) => void;
}) {
  return (
    <div className="space-y-3">
      <Panel title="Investigate" subtitle="Searches the most recent slice of bookings, emails and timeline rows. Older records are not reachable this way.">
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={term}
            onChange={(event) => onTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') search.run(term);
            }}
            placeholder="name, email, phone, booking id, order id, subject, correlation id…"
            aria-label="Operations search"
            className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button size="sm" onClick={() => search.run(term)} disabled={term.trim().length < 3 || search.loading}>
            <Search aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {search.loading ? 'Searching…' : 'Search'}
          </Button>
        </div>
        {search.error && (
          <p className="mt-2 text-xs font-medium text-warning" role="alert">
            {search.error}
          </p>
        )}
      </Panel>

      {correlationId && (
        <Panel
          title={`Correlation chain`}
          subtitle={`Stitched from the loaded timeline rows for ${correlationId}`}
        >
          <ChainView rows={correlationChain(payload.timelines, correlationId)} onAction={onAction} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.625rem] leading-relaxed text-muted-foreground">{CORRELATION_SLICE_BOUND}</p>
            <Button variant="ghost" size="sm" onClick={onClearTrace}>
              Clear trace filter
            </Button>
          </div>
        </Panel>
      )}

      {search.result && (
        <>
          {search.result.bookings.length > 0 && (
            <Panel title={`Matching bookings (${search.result.bookings.length})`}>
              <ul className="mt-3 space-y-2.5">
                {search.result.bookings.map((hit) => (
                  <BookingHitCard key={hit.id} hit={hit} onSearchBooking={onSearchBooking} onAction={onAction} />
                ))}
              </ul>
            </Panel>
          )}
          {search.result.emails.length > 0 && (
            <Panel title={`Matching emails (${search.result.emails.length})`}>
              <ul className="mt-3 space-y-2">
                {search.result.emails.map((hit) => (
                  <li key={hit.id} className="rounded-lg border border-hairline px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={hit.status === 'sent' || hit.status === 'delivered' ? 'success' : hit.status === 'failed' ? 'danger' : 'info'}
                        label={humanizeStatus(hit.status)}
                        title="Email status as stored."
                      />
                      <span className="text-xs font-medium text-primary">{hit.recipient}</span>
                      {hit.subject && <span className="truncate text-xs text-primary/70">{hit.subject}</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-hairline pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAction({ kind: 'resend', emailId: hit.id, recipient: hit.recipient })}
                      >
                        Resend
                      </Button>
                      {hit.bookingId && <CopyableId id={hit.bookingId} label="booking id" />}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {search.result.timelines.length > 0 && (
            <Panel title={`Matching timeline rows (${search.result.timelines.length})`}>
              <TimelineList
                rows={search.result.timelines}
                onCorrelation={onCorrelation}
                onSearchBooking={onSearchBooking}
              />
            </Panel>
          )}
          {search.result.bookings.length === 0 &&
            search.result.emails.length === 0 &&
            search.result.timelines.length === 0 && (
              <p className="rounded-xl border border-hairline bg-white px-4 py-3 text-xs text-muted-foreground shadow-sm">
                Nothing matched in the recent slice for “{search.result.query}”. The search looks at
                the most recent records only — it is not a full-ledger query.
              </p>
            )}
        </>
      )}
      {search.ran && !search.result && !search.loading && !search.error && (
        <p className="text-xs text-muted-foreground">The search did not return a readable result.</p>
      )}
    </div>
  );
}

function BookingHitCard({
  hit,
  onSearchBooking,
  onAction,
}: {
  hit: BookingHit;
  onSearchBooking: (id: string) => void;
  onAction: (action: PendingAction) => void;
}) {
  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-primary">{hit.name || 'Name not read'}</span>
        <Badge tone="neutral" label={humanizeStatus(hit.status)} title="Booking status as stored." />
        {hit.sessionType && <span className="text-[0.6875rem] text-muted-foreground">{hit.sessionType}</span>}
        {hit.therapistName && <span className="text-[0.6875rem] text-muted-foreground">· {hit.therapistName}</span>}
      </div>
      {(hit.email || hit.phone) && (
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          {[hit.email, hit.phone].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        <Link
          href={`/admin/bookings/${encodeURIComponent(hit.id)}`}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Open booking
        </Link>
        <Button variant="outline" size="sm" onClick={() => onAction({ kind: 'replay-event', eventName: 'BookingConfirmed', bookingId: hit.id })}>
          Replay confirm
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAction({ kind: 'calendar', bookingId: hit.id })}>
          Sync Calendar &amp; Meet
        </Button>
        <Button variant="outline" size="sm" onClick={() => onAction({ kind: 'replay-event', eventName: 'BookingExpired', bookingId: hit.id })}>
          Replay expiry
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onSearchBooking(hit.id)}>
          Find related records
        </Button>
        <CopyableId id={hit.id} label="booking id" />
      </div>
    </li>
  );
}

function ChainView({
  rows,
  onAction,
}: {
  rows: readonly TimelineRow[];
  onAction: (action: PendingAction) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        No loaded row carries this correlation id. The chain may be older than the loaded slice.
      </p>
    );
  }
  const bookingId = rows.find((row) => row.bookingId)?.bookingId ?? null;
  return (
    <ol className="mt-3 space-y-2">
      {rows.map((row, index) => {
        const severity = severityBadge(row.severity);
        return (
          <li key={row.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-surface text-[0.625rem] font-semibold tabular-nums text-primary">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={severity.tone} label={severity.label} title="Row severity as written." />
                <span className="font-mono text-xs text-primary">{row.event}</span>
                {row.createdAtIso && (
                  <span className="text-[0.6875rem] text-muted-foreground">{formatCreatedAt(row.createdAtIso)}</span>
                )}
              </div>
              {row.message && <p className="mt-0.5 text-xs leading-relaxed text-primary/80">{row.message}</p>}
              {bookingId && index === rows.length - 1 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => onAction({ kind: 'replay-event', eventName: 'BookingConfirmed', bookingId })}>
                    Replay confirm
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onAction({ kind: 'calendar', bookingId })}>
                    Sync Calendar &amp; Meet
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline tab
 * ------------------------------------------------------------------ */

function TimelineTab({
  rows,
  onCorrelation,
  onSearchBooking,
}: {
  rows: readonly TimelineRow[];
  onCorrelation: (id: string) => void;
  onSearchBooking: (id: string) => void;
}) {
  return (
    <Panel
      title="Recent timeline"
      subtitle="The most recent 100 rows, newest first. Actors are typed, not named — this is a machinery view, not an audit of people."
    >
      {rows.length === 0 ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-xs leading-relaxed text-primary/70">
            No timeline rows in what was read. Rows are written by events — a platform with no
            traffic shows nothing here, and so does a failed read: reload to tell the two apart.
          </p>
        </div>
      ) : (
        <TimelineList rows={rows} onCorrelation={onCorrelation} onSearchBooking={onSearchBooking} />
      )}
    </Panel>
  );
}

function TimelineList({
  rows,
  onCorrelation,
  onSearchBooking,
}: {
  rows: readonly TimelineRow[];
  onCorrelation: (id: string) => void;
  onSearchBooking: (id: string) => void;
}) {
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row) => {
        const severity = severityBadge(row.severity);
        return (
          <li key={row.id} className="rounded-lg border border-hairline px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge {...severity} label={severity.label} title="Row severity as written." />
              <span className="font-mono text-xs text-primary">{row.event}</span>
              <span className="text-[0.6875rem] text-muted-foreground">
                Actor: {actorLabel(row.actorType)}
              </span>
              {row.createdAtIso && (
                <span className="ml-auto text-[0.6875rem] text-muted-foreground">
                  {formatCreatedAt(row.createdAtIso)}
                </span>
              )}
            </div>
            {row.message && <p className="mt-1 text-xs leading-relaxed text-primary/80">{row.message}</p>}
            {(row.correlationId || row.bookingId) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {row.correlationId && (
                  <button
                    type="button"
                    onClick={() => onCorrelation(row.correlationId as string)}
                    className="rounded bg-info-surface px-2 py-0.5 font-mono text-[0.625rem] text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title="Stitch the chain of this correlation"
                  >
                    correlation: {row.correlationId}
                  </button>
                )}
                {row.bookingId && (
                  <button
                    type="button"
                    onClick={() => onSearchBooking(row.bookingId as string)}
                    className="rounded bg-neutral-surface px-2 py-0.5 font-mono text-[0.625rem] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title="Search for the booking and its related records"
                  >
                    booking: {row.bookingId}
                  </button>
                )}
                {row.bookingId && (
                  <Link
                    href={`/admin/bookings/${encodeURIComponent(row.bookingId)}`}
                    className="text-[0.625rem] font-medium text-primary underline-offset-2 hover:underline"
                  >
                    open
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

function ReplayEventDialog({
  eventName,
  bookingId,
  busy,
  onConfirm,
  onClose,
}: {
  eventName: string;
  bookingId: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Replay ${eventName}`}
      subtitle={`Booking ${bookingId}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Don&apos;t act
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Replaying…' : 'Replay event'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>
          This republishes <span className="font-mono">{eventName}</span> for booking{' '}
          <span className="font-mono">{bookingId}</span>. Listeners act again: the related email is
          sent unless its record shows it already went out, and new timeline and audit entries are
          written for the replay itself.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Only BookingConfirmed and BookingExpired can be replayed — anything else is refused by
            the server, by design.
          </span>
        </p>
      </div>
    </ConfirmDialog>
  );
}

function CalendarDialog({
  bookingId,
  busy,
  onConfirm,
  onClose,
}: {
  bookingId: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Create calendar event"
      subtitle={`Booking ${bookingId}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Don&apos;t act
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Creating…' : 'Create event'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>
          This asks Google for the calendar event and Meet link. If it already exists, the existing
          one is reported instead of duplicated. The client&apos;s confirmation email goes out only
          if it has not already been sent.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            If creation fails, the error is recorded on the booking — the Calendar &amp; Meet screen
            reads it after a reload.
          </span>
        </p>
      </div>
    </ConfirmDialog>
  );
}

function ResendDialog({
  recipient,
  busy,
  onConfirm,
  onClose,
}: {
  recipient: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Resend email"
      subtitle={recipient}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Don&apos;t send
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Sending…' : 'Resend'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>
          This sends the stored email again — same recipient, same content, exactly as first
          rendered. If it already arrived, the client receives a duplicate.
        </p>
        <p>The dispatch history records the new attempt either way.</p>
      </div>
    </ConfirmDialog>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      {/* h3: the shell owns the page's h1. */}
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

function Badge({ label, tone, title }: { label: string; tone: AdminTone; title: string }) {
  return (
    <span
      title={title}
      className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(tone)}`}
    >
      {label}
    </span>
  );
}

function Notice({ tone, children }: { tone: AdminTone; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-xl px-4 py-2.5 text-xs leading-relaxed ${toneClasses(tone)}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

function LoadFailed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-medium text-primary">Operations could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

function OperationsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading operations…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
