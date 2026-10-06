'use client';

/**
 * The Email operations screen: what the platform told people, what failed, and
 * the one write it offers — resending a stored email verbatim.
 *
 * Structure, in operator order:
 *  1. A booking lookup, which is how an email is actually found ("what did
 *     bk_x get?") — a server-side query, not a filter over the recent slice.
 *  2. The log list, newest first, with client-side status/search filters that
 *     say out loud that they only see what this page read.
 *  3. An expandable dispatch history per email, plus the plaintext backup —
 *     the recovery copy of exactly what was sent. The rendered HTML is never
 *     fetched here; no operator action consumes it.
 *
 * Resend is confirmed, because it sends a real email to a real person: the
 * dialog states that the content and recipient are the stored ones and nothing
 * is editable. One resend in flight at a time.
 */
import * as React from 'react';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  EMAIL_FILTER_BOUND,
  emailStatusBadge,
  filterEmailLog,
  tallyEmailLog,
  type EmailLogDetail,
  type EmailLogRow,
} from '@/domains/admin/emailTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { CopyableId } from '../../bookings/CopyableId';
import { ConfirmDialog } from '../../ConfirmDialog';
import { interpretReplayActionResponse } from '../jobs/replayResponse';
import { useAdminEmails } from './useAdminEmails';
import type { AdminEmailsPayload } from './adminEmailsResponse';
import { useAdminEmailDetail } from './useAdminEmailDetail';

interface ResendBanner {
  readonly tone: AdminTone;
  readonly text: string;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent / Delivered' },
  { value: 'failed', label: 'Failed' },
  { value: 'queued', label: 'Queued' },
  { value: 'sending', label: 'Sending' },
] as const;

export function EmailScreen() {
  const [lookupDraft, setLookupDraft] = useState('');
  const [lookupBookingId, setLookupBookingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [term, setTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resendTarget, setResendTarget] = useState<EmailLogRow | null>(null);
  const [resending, setResending] = useState(false);
  const [banner, setBanner] = useState<ResendBanner | null>(null);

  const { data, loading, initialLoading, error, reload } = useAdminEmails(lookupBookingId);
  const detail = useAdminEmailDetail(expandedId);

  if (initialLoading) return <EmailsSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  // The response echoes which query produced it — that echo, not the local
  // state, decides what the page claims it is showing. They agree in normal
  // operation; trusting the payload keeps the claim true even across a lookup
  // that was changed between the request and the render.
  const activeBookingId = data.bookingId;

  async function confirmResend() {
    if (!resendTarget || resending) return;
    setResending(true);
    try {
      const response = await fetchWithAuth('/api/email/resend', {
        method: 'POST',
        body: JSON.stringify({ emailId: resendTarget.id }),
      });
      let parsed: unknown = null;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }
      const result = interpretReplayActionResponse(response.status, parsed);
      setBanner(
        result.ok
          ? { tone: 'success', text: `${result.summary} The dispatch history records the new attempt.` }
          : { tone: 'warning', text: result.error }
      );
      setResendTarget(null);
      // The attempt count on the row changed server-side.
      reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so it is not known whether the resend happened. Reload before doing anything else.',
      });
      setResendTarget(null);
    } finally {
      setResending(false);
    }
  }

  function submitLookup() {
    const candidate = lookupDraft.trim();
    if (!candidate) return;
    setLookupBookingId(candidate);
    setExpandedId(null);
  }

  function clearLookup() {
    setLookupDraft('');
    setLookupBookingId(null);
    setExpandedId(null);
  }

  const scan = data.emails;
  const visibleRows = scan.ok ? filterEmailLog(scan.rows, statusFilter, term) : [];
  const tallies = scan.ok ? tallyEmailLog(scan.rows) : [];
  const filtered = statusFilter !== 'all' || term.trim().length > 0;

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
          <span className="font-medium">Resend: </span>
          {banner.text}
        </Notice>
      )}

      <LookupPanel
        draft={lookupDraft}
        onDraftChange={setLookupDraft}
        onSubmit={submitLookup}
        activeBookingId={activeBookingId}
        onClear={clearLookup}
      />

      <Panel
        title={activeBookingId ? `Emails for booking ${activeBookingId}` : 'Most recent emails'}
        subtitle={
          activeBookingId
            ? 'Every email logged for this booking, newest first.'
            : `The most recent ${data.scanLimit} dispatches. Older history is reachable through the booking lookup above.`
        }
      >
        {!scan.ok ? (
          <>
            <p className="mt-2 text-xs font-medium text-danger">{scan.reason}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              This is missing, not empty. Do not read it as nothing having been sent.
            </p>
          </>
        ) : scan.rows.length === 0 ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-primary/70">
              {activeBookingId
                ? 'No email has been logged for this booking. That is a real empty, not a failed read.'
                : `No email in what was read — ${data.scanLimit} documents deep. A real empty, not a failed read.`}
            </p>
          </div>
        ) : (
          <>
            {tallies.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {tallies.map((tally) => (
                  <span
                    key={tally.status}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${toneClasses(tally.tone)}`}
                  >
                    <span className="tabular-nums">{tally.count}</span> {tally.status}
                  </span>
                ))}
              </div>
            )}

            <Filters
              statusFilter={statusFilter}
              onStatus={setStatusFilter}
              term={term}
              onTerm={setTerm}
            />

            {visibleRows.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Nothing in the read slice matches these filters. The filters see only what this page
                read — {EMAIL_FILTER_BOUND}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {visibleRows.map((row) => (
                  <EmailCard
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    detail={expandedId === row.id ? detail : { kind: 'idle' }}
                    onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    onResend={() => setResendTarget(row)}
                  />
                ))}
              </ul>
            )}

            {filtered && (
              <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
                {EMAIL_FILTER_BOUND}
              </p>
            )}
            {scan.atLeast && (
              <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
                The read stops at {data.scanLimit} documents and there were more.
              </p>
            )}
          </>
        )}
      </Panel>

      {resendTarget && (
        <ResendDialog
          row={resendTarget}
          busy={resending}
          onConfirm={confirmResend}
          onClose={() => {
            if (!resending) setResendTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header + lookup
 * ------------------------------------------------------------------ */

function Reading({
  payload,
  loading,
  onReload,
}: {
  payload: AdminEmailsPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Email operations</p>
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

function LookupPanel({
  draft,
  onDraftChange,
  onSubmit,
  activeBookingId,
  onClear,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  activeBookingId: string | null;
  onClear: () => void;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-primary">Find every email for one booking</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* The FIELD class matches the schedule editor's inputs; type="search"
            so the browser's clear affordance appears for free. */}
        <input
          type="search"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSubmit();
          }}
          placeholder="booking id, e.g. bk_20260915_3B221AE5"
          aria-label="Booking id"
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button size="sm" onClick={onSubmit} disabled={draft.trim().length === 0}>
          <Search aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Look up
        </Button>
        {activeBookingId && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Show most recent instead
          </Button>
        )}
      </div>
    </div>
  );
}

function Filters({
  statusFilter,
  onStatus,
  term,
  onTerm,
}: {
  statusFilter: string;
  onStatus: (value: string) => void;
  term: string;
  onTerm: (value: string) => void;
}) {
  const fieldClass =
    'rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        value={statusFilter}
        onChange={(event) => onStatus(event.target.value)}
        aria-label="Filter by status"
        className={fieldClass}
      >
        {STATUS_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        value={term}
        onChange={(event) => onTerm(event.target.value)}
        placeholder="Search recipient, subject, type, booking id…"
        aria-label="Search the read slice"
        className={`min-w-0 flex-1 ${fieldClass}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One email, collapsed and expanded
 * ------------------------------------------------------------------ */

function EmailCard({
  row,
  expanded,
  detail,
  onToggle,
  onResend,
}: {
  row: EmailLogRow;
  expanded: boolean;
  detail: ReturnType<typeof useAdminEmailDetail>;
  onToggle: () => void;
  onResend: () => void;
}) {
  const badge = emailStatusBadge(row.status);
  const when = row.createdAtIso ? formatCreatedAt(row.createdAtIso) : null;

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Badge {...badge} />
        <span className="text-xs font-medium text-primary">{row.recipient}</span>
        <span className="text-[0.6875rem] text-muted-foreground">{row.type}</span>
        <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
          {row.attemptCount} attempt{row.attemptCount === 1 ? '' : 's'}
        </span>
        {when && <span className="ml-auto text-[0.6875rem] text-muted-foreground">{when}</span>}
      </button>

      {row.subject && <p className="mt-1 truncate pl-6 text-xs text-primary/70">{row.subject}</p>}
      {row.lastError && (
        <p className="mt-1 pl-6 text-[0.6875rem] leading-relaxed text-danger">{row.lastError}</p>
      )}

      {expanded && (
        <div className="mt-3 border-t border-hairline pt-3">
          {detail.kind === 'loading' && (
            <p className="text-xs text-muted-foreground" role="status">
              Loading the dispatch history…
            </p>
          )}
          {detail.kind === 'error' && (
            <p className="text-xs font-medium text-warning" role="alert">
              {detail.error}
            </p>
          )}
          {detail.kind === 'not-found' && (
            <p className="text-xs font-medium text-warning" role="status">
              {detail.error}
            </p>
          )}
          {detail.kind === 'loaded' && <EmailDetail email={detail.email} onResend={onResend} />}
        </div>
      )}

      {!expanded && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5 pl-6">
          {row.bookingId && (
            <Link
              href={`/admin/bookings/${encodeURIComponent(row.bookingId)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Open booking
            </Link>
          )}
          {row.bookingId && <CopyableId id={row.bookingId} label="booking id" />}
        </div>
      )}
    </li>
  );
}

function EmailDetail({ email, onResend }: { email: EmailLogDetail; onResend: () => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-primary">Attempt dispatch history</h4>
        {email.attempts.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">No attempts recorded.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {email.attempts.map((attempt) => (
              <li
                key={attempt.attemptNumber}
                className="rounded-lg bg-neutral-surface px-2.5 py-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-primary">Attempt #{attempt.attemptNumber}</span>
                  <Badge
                    tone={attempt.status === 'success' ? 'success' : 'danger'}
                    label={attempt.status === 'success' ? 'Success' : 'Failed'}
                    title={attempt.status === 'success' ? 'This attempt was accepted.' : 'This attempt did not go through.'}
                  />
                  {attempt.attemptedAtIso && (
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {formatCreatedAt(attempt.attemptedAtIso)}
                    </span>
                  )}
                  {attempt.responseId && (
                    <span className="font-mono text-[0.625rem] text-muted-foreground">
                      provider id: {attempt.responseId}
                    </span>
                  )}
                </div>
                {attempt.error && (
                  <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed text-danger">
                    {attempt.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold text-primary">Plaintext backup message</h4>
        <p className="mt-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">
          The stored plaintext of what was sent — the recovery copy, read-only. The rendered HTML is
          deliberately not fetched here.
        </p>
        {email.text ? (
          <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-surface px-3 py-2 font-mono text-[0.6875rem] leading-relaxed text-primary/80">
            {email.text}
          </pre>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">
            No plaintext was stored on this log entry.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onResend}>
          Resend email
        </Button>
        <CopyableId id={email.id} label="email id" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog
 * ------------------------------------------------------------------ */

function ResendDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: EmailLogRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Resend email"
      subtitle={row.recipient}
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
          This sends the stored email again — to{' '}
          <span className="font-medium text-primary">{row.recipient}</span>, with the subject and
          content exactly as first rendered. Nothing is editable, and no other email can be sent
          through this action.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            If the original actually arrived, the client receives a duplicate. A new attempt is
            recorded on the dispatch history either way.
          </span>
        </p>
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
      <p className="font-medium text-primary">The email log could not be loaded</p>
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

function EmailsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading the email log…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-20 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-64 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
