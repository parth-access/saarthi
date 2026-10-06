'use client';

/**
 * The Background jobs screen: what the machinery is holding, what it gave up on,
 * and the two replays an admin is allowed to ask for.
 *
 * Order of the panels is the order of urgency: dead letters lead because
 * nothing at all will pick them up again; waiting rows follow because they are
 * someone's pending work; failed outbox rows sit between states and are rare;
 * the email queue closes the page. Every action is confirmed before it is sent —
 * the legacy control room fired replays on a single click, which is exactly the
 * shape of accident a console like this exists to prevent.
 */
import * as React from 'react';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  attemptsDisplay,
  describeJobsScanBound,
  emailStatusBadge,
  isReplayableEvent,
  outboxStatusBadge,
  REPLAYABLE_EVENT_NAMES,
  type JobEmailRow,
  type JobEventRow,
} from '@/domains/admin/jobsTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { CopyableId } from '../../bookings/CopyableId';
import { ConfirmDialog } from '../../ConfirmDialog';
import type { AdminJobsPayload, JobScan } from './adminJobsResponse';
import { interpretReplayActionResponse } from './replayResponse';
import { useAdminJobs } from './useAdminJobs';

interface ReplayBanner {
  readonly tone: AdminTone;
  readonly text: string;
}

type ReplayRequest =
  | { readonly kind: 'event'; readonly row: JobEventRow }
  | { readonly kind: 'email'; readonly row: JobEmailRow };

export function JobsScreen() {
  const { data, loading, initialLoading, error, reload } = useAdminJobs();
  const [replayRequest, setReplayRequest] = useState<ReplayRequest | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [banner, setBanner] = useState<ReplayBanner | null>(null);

  if (initialLoading) return <JobsSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  async function confirmReplay() {
    if (!replayRequest || replaying) return;
    setReplaying(true);
    try {
      const body =
        replayRequest.kind === 'email'
          ? { action: 'resend_email', emailId: replayRequest.row.id }
          : {
              action: 'replay_event',
              bookingId: replayRequest.row.aggregateId,
              eventName: replayRequest.row.name,
            };
      const response = await fetchWithAuth('/api/operations/replay', {
        method: 'POST',
        body: JSON.stringify(body),
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
          ? { tone: 'success', text: `${result.summary} Reload to see the effect.` }
          : { tone: 'warning', text: result.error }
      );
      setReplayRequest(null);
      reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so it is not known whether the replay happened. Reload before doing anything else.',
      });
      setReplayRequest(null);
    } finally {
      setReplaying(false);
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
          <span className="font-medium">Replay: </span>
          {banner.text}
        </Notice>
      )}

      <DrivenBy />

      <DeadLetters scan={data.outbox.dead} scanLimit={data.scanLimit} onReplay={setReplayRequest} />
      <Waiting scan={data.outbox.waiting} scanLimit={data.scanLimit} />
      <OutboxFailed scan={data.outbox.failed} scanLimit={data.scanLimit} />
      <EmailQueue
        queued={data.emails.queued}
        failed={data.emails.failed}
        scanLimit={data.scanLimit}
        onReplay={setReplayRequest}
      />

      {replayRequest?.kind === 'event' && (
        <ReplayEventDialog
          row={replayRequest.row}
          busy={replaying}
          onConfirm={confirmReplay}
          onClose={() => {
            if (!replaying) setReplayRequest(null);
          }}
        />
      )}
      {replayRequest?.kind === 'email' && (
        <ReplayEmailDialog
          row={replayRequest.row}
          busy={replaying}
          onConfirm={confirmReplay}
          onClose={() => {
            if (!replaying) setReplayRequest(null);
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
  payload: AdminJobsPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Background jobs</p>
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

function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">A scheduled job drains the outbox</span>, every five
      minutes, retrying with backoff up to each event&apos;s attempt ceiling. Waiting events need
      nothing from you. Dead letters and failed emails are different: nothing re-drives those, which
      is why they lead this page and why replay exists.
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

function DeadLetters({
  scan,
  scanLimit,
  onReplay,
}: {
  scan: JobScan<JobEventRow>;
  scanLimit: number;
  onReplay: (request: ReplayRequest) => void;
}) {
  if (!scan.ok) {
    return (
      <Panel title="Dead letters">
        <p className="mt-2 text-xs font-medium text-danger">{scan.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is missing, not empty. Do not read it as no event having failed for good.
        </p>
      </Panel>
    );
  }

  const bound = describeJobsScanBound(scan.atLeast, scanLimit);

  return (
    <Panel title="Dead letters" subtitle="Events that used every attempt and will never be retried on their own.">
      {scan.rows.length === 0 ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-xs leading-relaxed text-primary/70">
            No dead letters in what was scanned — {scanLimit} documents deep. This is a real empty,
            not a failed read.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {scan.rows.map((row) => (
            <EventCard key={row.id} row={row} onReplay={onReplay} />
          ))}
        </ul>
      )}
      {bound && <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">{bound}</p>}
    </Panel>
  );
}

function Waiting({ scan, scanLimit }: { scan: JobScan<JobEventRow>; scanLimit: number }) {
  if (!scan.ok) {
    return (
      <Panel title="Waiting events">
        <p className="mt-2 text-xs font-medium text-warning">{scan.reason}</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Waiting events"
      subtitle="Pending or claimed by a worker — the processor's own selection, retried with backoff. Nothing to do here."
    >
      {scan.rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Nothing is waiting in what was scanned — a real empty for a queue this small.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {scan.rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-hairline px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge {...outboxStatusBadge(row.status)} />
                <span className="font-mono text-xs text-primary">{row.name}</span>
                <span className="text-[0.6875rem] text-muted-foreground">{attemptsDisplay(row)}</span>
              </div>
              {row.error && (
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-warning">{row.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {scan.atLeast && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
          The scan stops at {scanLimit} documents and there were more.
        </p>
      )}
    </Panel>
  );
}

function OutboxFailed({ scan, scanLimit }: { scan: JobScan<JobEventRow>; scanLimit: number }) {
  if (!scan.ok) {
    return (
      <Panel title="Outbox failures">
        <p className="mt-2 text-xs font-medium text-warning">{scan.reason}</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Outbox failures"
      subtitle="Rows at `failed` are between states — the processor writes pending for another try, or dead when tries run out."
    >
      {scan.rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">None right now — the normal state.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {scan.rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-hairline px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge {...outboxStatusBadge(row.status)} />
                <span className="font-mono text-xs text-primary">{row.name}</span>
                <span className="text-[0.6875rem] text-muted-foreground">{attemptsDisplay(row)}</span>
              </div>
              {row.error && (
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-warning">{row.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {scan.atLeast && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
          The scan stops at {scanLimit} documents and there were more.
        </p>
      )}
    </Panel>
  );
}

function EmailQueue({
  queued,
  failed,
  scanLimit,
  onReplay,
}: {
  queued: JobScan<JobEmailRow>;
  failed: JobScan<JobEmailRow>;
  scanLimit: number;
  onReplay: (request: ReplayRequest) => void;
}) {
  return (
    <>
      <Panel
        title="Email queue"
        subtitle="In flight. A queued email that stays here across two reads is a processor question, not an operator action."
      >
        {!queued.ok ? (
          <p className="mt-2 text-xs font-medium text-warning">{queued.reason}</p>
        ) : queued.rows.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Nothing queued in what was scanned.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {queued.rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-hairline px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge {...emailStatusBadge(row.status)} />
                  <span className="text-xs font-medium text-primary">{row.recipient}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">{row.type}</span>
                  <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
                    {row.attemptCount} attempt{row.attemptCount === 1 ? '' : 's'}
                  </span>
                </div>
                {row.subject && <p className="mt-1 truncate text-xs text-primary/70">{row.subject}</p>}
              </li>
            ))}
          </ul>
        )}
        {queued.ok && queued.atLeast && (
          <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
            The scan stops at {scanLimit} documents and there were more.
          </p>
        )}
      </Panel>

      <Panel
        title="Failed emails"
        subtitle="Retries exhausted. Resending sends the stored content, to the stored recipient — nothing is editable."
      >
        {!failed.ok ? (
          <p className="mt-2 text-xs font-medium text-danger">{failed.reason}</p>
        ) : failed.rows.length === 0 ? (
          <div className="mt-2 flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-primary/70">
              No failed email in what was scanned — {scanLimit} documents deep. A real empty, not a
              failed read.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {failed.rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-hairline bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge {...emailStatusBadge(row.status)} />
                  <span className="text-xs font-medium text-primary">{row.recipient}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">{row.type}</span>
                  <span className="text-[0.6875rem] tabular-nums text-muted-foreground">
                    {row.attemptCount} attempt{row.attemptCount === 1 ? '' : 's'}
                  </span>
                </div>
                {row.subject && <p className="mt-1 truncate text-xs text-primary/70">{row.subject}</p>}
                {row.lastError && (
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-danger">{row.lastError}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-hairline pt-2">
                  <Button variant="outline" size="sm" onClick={() => onReplay({ kind: 'email', row })}>
                    Resend email
                  </Button>
                  {row.bookingId && <CopyableId id={row.bookingId} label="booking id" />}
                </div>
              </li>
            ))}
          </ul>
        )}
        {failed.ok && failed.atLeast && (
          <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
            The scan stops at {scanLimit} documents and there were more.
          </p>
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * One outbox event
 * ------------------------------------------------------------------ */

function EventCard({
  row,
  onReplay,
}: {
  row: JobEventRow;
  onReplay: (request: ReplayRequest) => void;
}) {
  const badge = outboxStatusBadge(row.status);
  const replayable = isReplayableEvent(row);

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge {...badge} />
        <span className="font-mono text-xs text-primary">{row.name}</span>
        <span className="text-[0.6875rem] text-muted-foreground">{attemptsDisplay(row)}</span>
      </div>

      {row.error && (
        <p className="mt-2 rounded-lg bg-danger-surface px-2.5 py-1.5 text-xs leading-relaxed text-danger">
          <span className="font-medium">Last error: </span>
          {row.error}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        {replayable && row.aggregateId && (
          <Button variant="outline" size="sm" onClick={() => onReplay({ kind: 'event', row })}>
            Replay {row.name}
          </Button>
        )}
        {row.aggregateType === 'booking' && row.aggregateId && (
          <CopyableId id={row.aggregateId} label="booking id" />
        )}
        {!replayable && (
          <span className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            No replay for this event type. Read the booking and the flow it belongs to before
            deciding anything else.
          </span>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

function ReplayEventDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: JobEventRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Replay ${row.name}`}
      subtitle={row.aggregateId ? `Booking ${row.aggregateId}` : undefined}
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
          This republishes <span className="font-mono">{row.name}</span> for booking{' '}
          <span className="font-mono">{row.aggregateId}</span>. Listeners act again: the confirmation
          or expiry email is sent unless its record shows it already went out, and new timeline and
          audit entries are written for the replay itself.
        </p>
        <p>
          The dead-letter row stays on the books — replay does not rewrite it. It documents what
          failed; the replay is what moves the world forward.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Only {REPLAYABLE_EVENT_NAMES.join(' and ')} can be replayed, and only for bookings.</span>
        </p>
      </div>
    </ConfirmDialog>
  );
}

function ReplayEmailDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: JobEmailRow;
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
            Don&apos;t act
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
          rendered. Nothing about it is editable here, and a different email cannot be sent through
          this action.
        </p>
        <p>A new attempt is recorded on the email&apos;s dispatch history either way.</p>
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
      <p className="font-medium text-primary">Background jobs could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a page that
        listed some queues would read as though the rest were healthy.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

function JobsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading background jobs…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
