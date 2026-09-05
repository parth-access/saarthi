'use client';

/**
 * The admin console's landing page: what needs attention, what is happening
 * today, and whether the background machinery is moving.
 *
 * Three rules shape what is on screen, and all three are about what it refuses
 * to say:
 *
 *  1. **A number that could not be read is never a zero.** Every count arrives as
 *     a `BoundedCount` that either answered or admits it did not, and a failed
 *     reading is shown as prominently as work — in the same grid, in the same
 *     position — because the mistake this page can cause is an operator seeing
 *     six zeroes and going for coffee.
 *  2. **Nothing here is a health light.** The machinery panel prints a reading of
 *     the outbox with its own caveat attached, not a green dot. There is no
 *     collection in this platform that records a cron run, so "the jobs are
 *     running" is not a claim this console can make, and it does not make it.
 *  3. **Every figure is a scan, and every scan says its bound.** `60+` is not 60.
 *
 * Queue tiles are ordered by {@link ATTENTION_QUEUES} rather than by count, so the
 * page does not reshuffle under a cursor between two reads.
 */
import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  formatBoundedCount,
  machineryTone,
  orderTodaySchedule,
  readMachinery,
  summariseAttention,
  type AttentionRow,
} from '@/domains/admin/overviewTriage';
import type { AdminBookingRow, AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  formatSessionDayLong,
  meetIndicator,
  statusBadge,
  toneClasses,
} from '../bookings/adminBookingPresentation';
import { describeOverviewGaps, type AdminOverviewPayload } from './adminOverviewResponse';
import { describeDayProgress, phasePresentation, queueDestination } from './overviewPresentation';
import { useAdminOverview } from './useAdminOverview';

export function OverviewScreen() {
  const { data, loading, initialLoading, error, reload } = useAdminOverview();

  // Sampled once per payload rather than on every render, so a hold age or a
  // session phase does not change while an operator is reading the sentence it
  // is in. The next reload takes a fresh reading.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nowMs = useMemo(() => Date.now(), [data]);

  if (initialLoading) return <OverviewSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  const gaps = describeOverviewGaps(data);
  const attention = summariseAttention(data.attention);
  const needsReading = [...attention.actionable, ...attention.unknown];
  const clear = attention.rows.filter((row) => !row.actionable && !row.unknown);

  return (
    <div className="space-y-3">
      <Reading payload={data} loading={loading} onReload={reload} />

      {error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error} What you see below was
          read at {formatCreatedAt(data.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}.
        </Notice>
      )}

      {gaps && (
        <Notice tone="warning">
          <span className="font-medium">{gaps.sentence}</span> The server logged why; the queues
          below show a dash where a number would be.
        </Notice>
      )}

      {attention.allClear ? (
        <AllClear scanLimit={data.scanLimit} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {needsReading.map((row) => (
            <QueueCard
              key={row.definition.id}
              row={row}
              note={row.definition.id === 'lapsed_holds' ? data.notes.lapsed_holds : null}
              scanLimit={data.scanLimit}
            />
          ))}
        </div>
      )}

      {!attention.allClear && clear.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          <span className="font-medium text-primary/70">Checked and empty:</span>{' '}
          {clear.map((row) => row.definition.label).join(', ')}.
        </p>
      )}

      <Today payload={data} nowMs={nowMs} />
      <Machinery payload={data} nowMs={nowMs} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

/**
 * When this was read, and the button to read it again.
 *
 * The timestamp is not decoration. Nothing on this page polls, so an operator who
 * left the tab open at 09:00 is looking at 09:00 — and the only thing that makes
 * that safe is saying so.
 */
function Reading({
  payload,
  loading,
  onReload,
}: {
  payload: AdminOverviewPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{formatSessionDayLong(payload.istDate)}</p>
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

/* ------------------------------------------------------------------ *
 * Attention queues
 * ------------------------------------------------------------------ */

/**
 * One queue: how many, what it means, what it costs, and where it is dealt with.
 *
 * `meaning` and `consequence` are always shown rather than hidden behind a
 * tooltip. An operator who has not seen "Confirmed with no Meet link" before
 * needs to know, in the same glance, that those clients were told the session is
 * on and have no way to join it.
 */
function QueueCard({
  row,
  note,
  scanLimit,
}: {
  row: AttentionRow;
  /** An extra observed fact for this queue, when the server sent one. */
  note: string | null;
  scanLimit: number;
}) {
  const { definition, count } = row;
  const destination = queueDestination(definition);
  const tone: AdminTone = row.unknown ? 'warning' : definition.tone;

  return (
    <section className="flex flex-col rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-primary">{definition.label}</h3>
        <span
          className={`shrink-0 rounded-lg px-2 py-0.5 text-base font-semibold tabular-nums ${toneClasses(tone)}`}
          title={
            count.ok
              ? count.atLeast
                ? `At least ${count.count}. The scan stops at ${scanLimit} documents.`
                : `${count.count} in this queue.`
              : count.reason
          }
        >
          {formatBoundedCount(count)}
        </span>
      </div>

      {row.unknown && !count.ok && (
        <p className="mt-2 text-xs font-medium text-warning">
          {count.reason} This is missing, not zero.
        </p>
      )}

      <p className="mt-2 text-xs leading-relaxed text-primary/70">{definition.meaning}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{definition.consequence}</p>

      {note && <p className="mt-1.5 text-xs font-medium text-primary/80">{note}</p>}

      {count.ok && count.atLeast && (
        <p className="mt-1.5 text-[0.625rem] leading-relaxed text-muted-foreground">
          The scan stops at {scanLimit} documents, so there may be more than shown.
        </p>
      )}

      <div className="mt-auto pt-3">
        {destination.href ? (
          <Link
            href={destination.href}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {destination.cta}
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">{destination.cta}</p>
        )}
        {destination.note && (
          <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground">
            {destination.note}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The only place this console says nothing needs doing.
 *
 * It is allowed to say it because `allClear` requires every queue to have both
 * answered *and* answered zero — one failed scan makes it false. What it still
 * does not claim is that the platform is healthy: it names the bound it checked
 * within, because six empty queues read 60 documents deep is a different
 * statement from six empty queues.
 */
function AllClear({ scanLimit }: { scanLimit: number }) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 rounded-lg p-1.5 ${toneClasses('success')}`}>
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-primary">No queue has anything waiting</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            All six checks answered, and all six were empty: approvals, lapsed payment holds,
            confirmed sessions without a Meet link, refunds owed, abandoned background events and
            failed emails. Each was read up to {scanLimit} documents deep.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */

function Today({ payload, nowMs }: { payload: AdminOverviewPayload; nowMs: number }) {
  if (!payload.today.ok) {
    return (
      <Panel title="Today">
        <p className="mt-2 text-xs font-medium text-warning">{payload.today.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          The day is unknown, not empty. Bookings can still be found in the Bookings section.
        </p>
      </Panel>
    );
  }

  const { sessions, other, atLeast } = payload.today;
  const schedule = orderTodaySchedule(sessions, nowMs);

  return (
    <Panel title="Today" subtitle={describeDayProgress(schedule)}>
      {schedule.entries.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No confirmed or completed sessions are on {payload.istDate}.
        </p>
      ) : (
        <ul className="mt-2">
          {schedule.entries.map((entry) => (
            <SessionRow key={entry.row.id} row={entry.row} phase={entry.phase} />
          ))}
        </ul>
      )}

      {other.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <h4 className="text-xs font-semibold text-primary/80">
            Also on today&apos;s date, but not a session
          </h4>
          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">
            Requests, unpaid holds and cancellations dated today. Shown because a cancellation on
            today&apos;s date is usually the thing you are looking for.
          </p>
          <ul className="mt-2">
            {other.map((row) => (
              <SessionRow key={row.id} row={row} phase={null} />
            ))}
          </ul>
        </div>
      )}

      {atLeast && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
          The day&apos;s scan filled its limit, so this list may be incomplete. Use Bookings filtered
          by date to see all of {payload.istDate}.
        </p>
      )}
    </Panel>
  );
}

function SessionRow({
  row,
  phase,
}: {
  row: AdminBookingRow;
  /** Null for rows that are not sessions, which have no place in the clock. */
  phase: ReturnType<typeof orderTodaySchedule>['entries'][number]['phase'] | null;
}) {
  const status = statusBadge(row);
  const meet = meetIndicator(row);
  const phasing = phase ? phasePresentation(phase) : null;

  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-hairline py-2 last:border-b-0">
      <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-primary/80">
        {row.time || '—'}
      </span>

      {phasing && <Badge tone={phasing.tone} label={phasing.label} title={phasing.title} />}

      <Link
        href={`/admin/bookings/${encodeURIComponent(row.id)}`}
        className="min-w-0 flex-1 truncate text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {row.clientName || 'Name not stored'}
      </Link>

      <Badge tone={status.tone} label={status.label} title={status.title} />

      {meet.presence === 'missing' && <Badge tone="danger" label={meet.label} title={meet.title} />}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Background machinery
 * ------------------------------------------------------------------ */

/**
 * A reading of the outbox, with what it cannot tell you attached.
 *
 * The caveat is rendered unconditionally, including when the verdict is `idle`.
 * An empty queue means no event is waiting; it does not mean the worker ran. This
 * platform records no cron heartbeat anywhere, so there is nothing here that
 * could honestly be drawn as a green light — and a green light is exactly what an
 * operator would stop checking.
 */
function Machinery({ payload, nowMs }: { payload: AdminOverviewPayload; nowMs: number }) {
  const reading = readMachinery(payload.machinery, nowMs);
  const tone = machineryTone[reading.verdict];

  return (
    <Panel title="Background machinery">
      <div className="mt-2 flex items-start gap-2.5">
        {reading.verdict === 'stalled' || reading.verdict === 'unknown' ? (
          <span className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${toneClasses(tone)}`}>
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className={`text-xs font-medium ${tone === 'neutral' ? 'text-primary' : `${toneClasses(tone)} inline-block rounded px-1.5 py-0.5`}`}>
            {reading.headline}
          </p>
          <ul className="mt-1.5 space-y-1">
            {reading.detail.map((line) => (
              <li key={line} className="text-xs leading-relaxed text-primary/70">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.625rem] leading-relaxed text-muted-foreground">
            {reading.caveat}
          </p>
        </div>
      </div>
    </Panel>
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
      {/* h3: the shell owns the page's h1, and this page has no h2 of its own. */}
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
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
    <p className={`rounded-xl px-4 py-2.5 text-xs leading-relaxed ${toneClasses(tone)}`} role="status">
      {children}
    </p>
  );
}

function LoadFailed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-medium text-primary">The overview could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a page that
        listed four of six queues would read as though the other two were empty.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function OverviewSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading the overview…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-44 animate-pulse rounded-xl bg-neutral-surface" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
