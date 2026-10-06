'use client';

/**
 * The Calendar & Meet screen: confirmed sessions with no Meet link, why each one
 * is missing it, and the one action this console can take — asking the server to
 * create the event now rather than waiting for the five-minute job.
 *
 * Three honesty rules, inherited from the refunds screen:
 *
 *  1. A failed read is never an empty list. "No session is missing a link" and
 *     "this read failed" are different facts and get different sentences.
 *  2. The retry's consequences are stated before it is offered: it creates the
 *     event and Meet link, sends the confirmation email only if it has not
 *     already gone out, and — if it fails — records the error on the booking,
 *     which is where this list reads it from after a reload.
 *  3. An unknown outcome (the request never completed) offers reload, never
 *     retry, because retrying blind is how a duplicate event gets made.
 */
import * as React from 'react';
import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  calendarStatusBadge,
  describeCalendarScanBound,
  isConfigurationError,
  tallyCalendarProblems,
  type CalendarProblemRow,
} from '@/domains/admin/calendarTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  formatSessionDayLong,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { CopyableId } from '../../bookings/CopyableId';
import { ConfirmDialog } from '../../ConfirmDialog';
import { describeCalendarGaps, type AdminCalendarPayload } from './adminCalendarResponse';
import { interpretCalendarRetryResponse } from './calendarRetryResponse';
import { useAdminCalendar } from './useAdminCalendar';

interface RetryBanner {
  readonly tone: AdminTone;
  readonly text: string;
}

export function CalendarScreen() {
  const { data, loading, initialLoading, error, reload } = useAdminCalendar();
  const [retryTarget, setRetryTarget] = useState<CalendarProblemRow | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [banner, setBanner] = useState<RetryBanner | null>(null);

  if (initialLoading) return <CalendarSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  const gaps = describeCalendarGaps(data);

  async function confirmRetry() {
    if (!retryTarget || retrying) return;
    setRetrying(true);
    try {
      const response = await fetchWithAuth('/api/admin/calendar/retry', {
        method: 'POST',
        body: JSON.stringify({ bookingId: retryTarget.id }),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const result = interpretCalendarRetryResponse(response.status, body);
      if (result.ok) {
        setBanner({
          tone: result.outcome === 'already_exists' ? 'info' : 'success',
          text: `${result.summary} The row will drop off this list on reload.`,
        });
      } else {
        setBanner({ tone: 'warning', text: result.error });
      }
      setRetryTarget(null);
      reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so it is not known whether the retry happened. Reload before doing anything else.',
      });
      setRetryTarget(null);
    } finally {
      setRetrying(false);
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
          <span className="font-medium">Calendar retry: </span>
          {banner.text}
        </Notice>
      )}

      {gaps && (
        <Notice tone="danger">
          <span className="font-medium">{gaps}</span> A blank list here would read as every session
          having its Meet link, so the failure is named instead.
        </Notice>
      )}

      <DrivenBy />

      <Problems payload={data} onRetry={(row) => setRetryTarget(row)} />

      {retryTarget && (
        <RetryDialog
          row={retryTarget}
          busy={retrying}
          onConfirm={confirmRetry}
          onClose={() => {
            if (!retrying) setRetryTarget(null);
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
  payload: AdminCalendarPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Calendar &amp; Meet</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Read at {formatCreatedAt(payload.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}. This page does
          not refresh on its own.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reading…' : 'Read again'}
      </Button>
    </div>
  );
}

/**
 * Who else is working this queue — stated before the rows, because the honest
 * answer to "a session has no Meet link" is often "wait for the job", and an
 * operator needs to know a retry here is for acting now, not the only path.
 */
function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">A scheduled job also retries these</span>, every
      five minutes, using the same list. Retrying here does it now; it does not do anything the job
      would not — the event is created once, the client&apos;s confirmation email is sent only if it
      has not already gone out, and nothing about the booking&apos;s payment or status changes.
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * The list
 * ------------------------------------------------------------------ */

function Problems({
  payload,
  onRetry,
}: {
  payload: AdminCalendarPayload;
  onRetry: (row: CalendarProblemRow) => void;
}) {
  if (!payload.problems.ok) {
    return (
      <Panel title="Sessions missing a Meet link">
        <p className="mt-2 text-xs font-medium text-danger">{payload.problems.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is missing, not empty. Do not read it as every session having its link.
        </p>
      </Panel>
    );
  }

  const { rows, atLeast } = payload.problems;
  const tallies = tallyCalendarProblems(rows);
  const bound = describeCalendarScanBound(atLeast, payload.scanLimit);

  return (
    <Panel title="Sessions missing a Meet link">
      {tallies.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {tallies.map((tally) => (
            <span
              key={tally.status}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${toneClasses(tally.tone)}`}
            >
              <span className="tabular-nums">{tally.count}</span> {calendarStatusBadge(tally.status).label}
            </span>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-xs leading-relaxed text-primary/70">
            Every confirmed session in what was scanned has a Meet link — {payload.scanLimit}{' '}
            candidate documents deep. This is a real empty, not a failed read.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <ProblemCard key={row.id} row={row} onRetry={onRetry} />
          ))}
        </ul>
      )}

      {bound && <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">{bound}</p>}
    </Panel>
  );
}

/**
 * One affected session, read top to bottom: whose it is, when, why the link is
 * missing, and what can be done about it.
 */
function ProblemCard({
  row,
  onRetry,
}: {
  row: CalendarProblemRow;
  onRetry: (row: CalendarProblemRow) => void;
}) {
  const badge = calendarStatusBadge(row.calendarStatus);
  const configError = isConfigurationError(row.calendarError);
  const when = row.date ? formatSessionDayLong(row.date) : null;

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badge.tone} label={badge.label} title={badge.title} />
          {configError && (
            <Badge
              tone="danger"
              label="Needs configuration"
              title="Retrying cannot succeed until the Google Calendar credentials are configured."
            />
          )}
          {row.hasCalendarEventId && (
            <Badge
              tone="info"
              label="Event exists, link missing"
              title="A calendar event was created but its Meet link never came back. The retry recovers it instead of duplicating the event."
            />
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {row.clientName ? (
          <span className="text-sm font-medium text-primary">{row.clientName}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Client name not read</span>
        )}
        {when && row.time && (
          <span className="text-xs text-muted-foreground">
            · {when} at {row.time}
          </span>
        )}
        {row.sessionType && <span className="text-xs text-muted-foreground">· {row.sessionType}</span>}
      </div>

      {row.calendarError && (
        <p
          className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${toneClasses(configError ? 'danger' : 'warning')}`}
        >
          <span className="font-medium">Recorded error: </span>
          {row.calendarError}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        {!configError && (
          <Button variant="outline" size="sm" onClick={() => onRetry(row)}>
            Create calendar event
          </Button>
        )}
        {row.id && (
          <Link
            href={`/admin/bookings/${encodeURIComponent(row.id)}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open booking
            <ArrowRight aria-hidden="true" className="h-3 w-3" />
          </Link>
        )}
        {row.id && <CopyableId id={row.id} label="booking id" />}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      {/* h3: the shell owns the page's h1, and this page has no h2 of its own. */}
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Badge({ tone, label, title }: { tone: AdminTone; label: string; title: string }) {
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
      <p className="font-medium text-primary">Calendar &amp; Meet could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a page that
        listed some sessions would read as though the rest were fine.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function CalendarSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading Calendar &amp; Meet…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-64 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}

/** Exported for the screen's tests; not part of the page's own tree. */
export function RetryDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: CalendarProblemRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const when =
    row.date && row.time
      ? `${formatSessionDayLong(row.date)} at ${row.time}`
      : 'the session on record';
  return (
    <ConfirmDialog
      title="Create calendar event"
      subtitle={row.clientName ? `${row.clientName} — ${when}` : when}
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
          This asks Google for a calendar event and a Meet link for this session. Nothing about the
          booking&apos;s status or payment changes.
        </p>
        <p>
          When the link is created, the client&apos;s confirmation email is sent — unless it has
          already gone out, in which case it is not sent twice.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            If the creation fails, the error is recorded on the booking and this list shows it after
            a reload.
          </span>
        </p>
      </div>
    </ConfirmDialog>
  );
}
