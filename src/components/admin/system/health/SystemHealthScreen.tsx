'use client';

/**
 * The System health screen: one page that reads the machinery through the two
 * APIs that already watch it — the admin overview (bounded scans of the
 * bookings, refunds, outbox and email collections) and the operations dashboard
 * (exact queue counts, configuration checks, the daily metrics).
 *
 * Two honesty rules shape it:
 *
 *  1. **Nothing is claimed that is not observed.** The scheduled jobs run in
 *     GitHub Actions, outside this application's sight — the screen says so
 *     rather than rendering a fabricated "scheduler: healthy". `daily_metrics`
 *     is written by real events but keyed to the UTC day and inflated by
 *     abandoned slot holds, so the counters carry those caveats on the page.
 *  2. **A failed read is a gap, not a zero.** Each source reports `{ ok }` and
 *     the screen renders the failures as named gaps — the one reading this page
 *     must never mistake a broken scan for a quiet queue.
 */
import * as React from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { METRICS_CAVEAT } from '@/domains/admin/operationsTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { useAdminOverview } from '../../overview/useAdminOverview';
import { useAdminOperations } from '../operations/useAdminOperations';

interface QueueRow {
  readonly label: string;
  readonly detail: string;
  readonly href: string;
  readonly read: { ok: boolean; count: number | null; atLeast: boolean };
  readonly tone: AdminTone;
}

export function SystemHealthScreen() {
  const overview = useAdminOverview();
  const operations = useAdminOperations();

  const loading = overview.loading || operations.loading;
  const initialLoading = overview.initialLoading || operations.initialLoading;
  const bothFailed =
    (!overview.data && !overview.initialLoading && Boolean(overview.error)) &&
    (!operations.data && !operations.initialLoading && Boolean(operations.error));

  if (initialLoading) return <HealthSkeleton />;
  if (bothFailed) {
    return (
      <LoadFailed
        error={overview.error ?? operations.error}
        onRetry={() => {
          overview.reload();
          operations.reload();
        }}
      />
    );
  }

  const queues: QueueRow[] = [];
  if (overview.data) {
    const a = overview.data.attention;
    const m = overview.data.machinery;
    queues.push(
      {
        label: 'Outbox events waiting',
        detail: 'Pending or claimed — the processor drains these every five minutes.',
        href: '/admin/system/jobs',
        read: { ok: m.waiting.ok, count: m.waiting.ok ? m.waiting.count : null, atLeast: m.waiting.ok ? m.waiting.atLeast : false },
        tone: 'info',
      },
      {
        label: 'Outbox dead letters',
        detail: 'Exhausted every attempt. Nothing will pick these up on its own.',
        href: '/admin/system/jobs',
        read: { ok: m.dead.ok, count: m.dead.ok ? m.dead.count : null, atLeast: m.dead.ok ? m.dead.atLeast : false },
        tone: 'danger',
      },
      {
        label: 'Emails failed to send',
        detail: 'Retries exhausted; a person resends from Email operations.',
        href: '/admin/system/email',
        read: { ok: a.emails_failed.ok, count: a.emails_failed.ok ? a.emails_failed.count : null, atLeast: a.emails_failed.ok ? a.emails_failed.atLeast : false },
        tone: 'danger',
      },
      {
        label: 'Sessions missing a Meet link',
        detail: 'The calendar job retries these every five minutes.',
        href: '/admin/system/calendar',
        read: { ok: a.missing_meet_link.ok, count: a.missing_meet_link.ok ? a.missing_meet_link.count : null, atLeast: a.missing_meet_link.ok ? a.missing_meet_link.atLeast : false },
        tone: 'warning',
      },
      {
        label: 'Refunds owed or retrying',
        detail: 'The refunds job holds the only credential that can move money.',
        href: '/admin/refunds',
        read: { ok: a.refunds_outstanding.ok, count: a.refunds_outstanding.ok ? a.refunds_outstanding.count : null, atLeast: a.refunds_outstanding.ok ? a.refunds_outstanding.atLeast : false },
        tone: 'warning',
      }
    );
  }

  const readAt =
    overview.data?.generatedAtIso ?? operations.data?.generatedAtIso ?? null;

  return (
    <div className="space-y-3">
      <Reading
        loading={loading}
        onReload={() => {
          overview.reload();
          operations.reload();
        }}
        readAt={readAt}
      />

      {(overview.error || operations.error) && (
        <Notice tone="warning">
          <span className="font-medium">Part of this page did not refresh.</span>{' '}
          {[overview.error, operations.error].filter(Boolean).join(' ')} The sections that did load
          are shown; the rest are named gaps.
        </Notice>
      )}

      <SchedulerNote />

      {overview.data ? (
        <Panel
          title="Queues"
          subtitle="What the machinery is holding right now. A missing count is a failed read, not a zero."
        >
          <ul className="mt-2 divide-y divide-hairline">
            {queues.map((queue) => (
              <li key={queue.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary">{queue.label}</p>
                  <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{queue.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  {queue.read.ok ? (
                    <span className={`text-lg font-semibold tabular-nums ${toneClasses(queue.tone).split(' ').pop()}`}>
                      {queue.read.count}
                      {queue.read.atLeast ? '+' : ''}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-warning" role="status">
                      not read
                    </span>
                  )}
                  <Link
                    href={queue.href}
                    className="text-[0.6875rem] font-medium text-primary underline-offset-2 hover:underline"
                  >
                    open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel title="Queues">
          <p className="mt-2 text-xs font-medium text-danger">{overview.error ?? 'Not read.'}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            This is missing, not empty. Do not read it as every queue being quiet.
          </p>
        </Panel>
      )}

      {operations.data && (
        <>
          <ConfigurationPanel diagnostics={operations.data.diagnostics} />
          <MetricsPanel metrics={operations.data.metrics} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

function SchedulerNote() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">The scheduled jobs run outside this application</span>{' '}
      — a GitHub Actions workflow pings the cron endpoints every five minutes (outbox processor,
      session reminders, session completion, calendar retries, refunds). This console cannot see the
      scheduler itself; the queues below are the work it produces, and a queue that never moves is
      how a stopped scheduler shows up here.
    </p>
  );
}

function ConfigurationPanel({
  diagnostics,
}: {
  diagnostics: { resendConfigured: boolean | null; razorpayConfigured: boolean | null; nodeEnv: string | null };
}) {
  const checks: Array<{ label: string; configured: boolean | null }> = [
    { label: 'Email (Resend)', configured: diagnostics.resendConfigured },
    { label: 'Payments (Razorpay)', configured: diagnostics.razorpayConfigured },
  ];
  return (
    <Panel
      title="Configuration"
      subtitle="Whether each integration's credentials are present in the environment. Presence is checked, not a live connection."
    >
      <ul className="mt-2 space-y-1.5">
        {checks.map((check) => (
          <li key={check.label} className="flex flex-wrap items-baseline gap-2">
            {check.configured === null ? (
              <Badge tone="neutral" label="Not read" title="This check did not load." />
            ) : check.configured ? (
              <Badge tone="success" label="Configured" title="Credentials present." />
            ) : (
              <Badge tone="danger" label="Missing" title="Flows that need this integration fail closed." />
            )}
            <span className="text-xs font-medium text-primary">{check.label}</span>
          </li>
        ))}
        <li className="flex flex-wrap items-baseline gap-2">
          <Badge tone="neutral" label="Runtime" title="The environment this console is served from." />
          <span className="text-xs font-medium text-primary">Environment</span>
          <span className="text-[0.6875rem] text-muted-foreground">{diagnostics.nodeEnv ?? '—'}</span>
        </li>
      </ul>
    </Panel>
  );
}

function MetricsPanel({
  metrics,
}: {
  metrics: readonly {
    date: string | null;
    bookingsCreated: number | null;
    bookingsConfirmed: number | null;
    paymentsSucceeded: number | null;
    paymentsFailed: number | null;
    emailsSent: number | null;
    emailsFailed: number | null;
  }[];
}) {
  return (
    <Panel title="Machinery counters, last seven UTC days" subtitle={METRICS_CAVEAT}>
      {metrics.length === 0 ? (
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
              {metrics.map((row, index) => (
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
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Reading({
  loading,
  onReload,
  readAt,
}: {
  loading: boolean;
  onReload: () => void;
  readAt: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">System health</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {readAt
            ? `Read at ${formatCreatedAt(readAt)} ${DISPLAY_TIME_ZONE_LABEL}. This page does not refresh on its own.`
            : 'Reading…'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reading…' : 'Read again'}
      </Button>
    </div>
  );
}

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
      <p className="font-medium text-primary">System health could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Neither source answered, so nothing is claimed about
        the machinery rather than half of it.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <CheckCircle2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading system health…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
