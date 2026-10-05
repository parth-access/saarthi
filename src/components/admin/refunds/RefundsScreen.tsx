'use client';

/**
 * The refunds screen: money owed that has not arrived, money that has, and a
 * plain statement of what this console can and cannot do about it.
 *
 * The rules that shape it are the ones that keep somebody from being forgotten or
 * paid twice:
 *
 *  1. **A failure to read is never an empty queue.** A scan that came back
 *     `{ ok: false }`, or a page that never loaded, is shown as a stated gap — not
 *     as "no refunds owed", which is the reading that makes an operator close the
 *     page and leave someone unpaid.
 *  2. **No number here is presented as more certain than it is.** The only
 *     refunded amount this console knows is one Razorpay returned; everything else
 *     is an estimate from the booking, marked as one, and totals say how many rows
 *     they could not price.
 *  3. **There is no retry button.** `/api/cron/process-refunds` is guarded by a
 *     secret a browser session cannot hold, so the page says the five-minute job
 *     drives these rather than offering a control that would do nothing — or, if
 *     it were wired to move money, do something irreversible on a misclick.
 *
 * Rows within a list keep their server order; the summary is sampled once per
 * payload so ages do not shift under a cursor between reads.
 */
import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  causeNeedsAPerson,
  describeRefundCause,
  describeRefundReason,
  refundAmountClaim,
  refundAnomalies,
  refundStanding,
  summariseRefundQueue,
  type AdminRefundRow,
} from '@/domains/admin/refundTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../bookings/adminBookingPresentation';
import { CopyableId } from '../bookings/CopyableId';
import { describeRefundGaps, type AdminRefundsPayload, type RefundScan } from './adminRefundsResponse';
import {
  describeOldestWait,
  describeOutstandingMoney,
  describeScanBound,
  refundAmountDisplay,
  tallyStandings,
} from './refundsPresentation';
import { useAdminRefunds } from './useAdminRefunds';

// PLACEHOLDER_BODY

export function RefundsScreen() {
  const { data, loading, initialLoading, error, reload } = useAdminRefunds();

  // Sampled once per payload rather than per render, so a wait time does not
  // change while an operator is reading the sentence it is in. Reload re-samples.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nowMs = useMemo(() => Date.now(), [data]);

  if (initialLoading) return <RefundsSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  const gaps = describeRefundGaps(data);

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
        <Notice tone="danger">
          <span className="font-medium">{gaps.sentence}</span> The server logged why. A blank list
          here would read as nothing owed, so the failure is named instead.
        </Notice>
      )}

      <DrivenBy />

      <Outstanding scan={data.outstanding} nowMs={nowMs} scanLimit={data.scanLimit} />
      <Settled scan={data.settled} nowMs={nowMs} scanLimit={data.scanLimit} />
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
  payload: AdminRefundsPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Refunds</p>
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
 * Who acts on this queue — which is not the person reading it.
 *
 * Stated once, at the top, rather than as a disabled button per row. The refunds
 * job holds the only credential that can call the gateway, and an operator needs
 * to know that the fix for a stuck refund is not on this screen before they go
 * looking for a button that is deliberately absent.
 */
function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">These are processed by a scheduled job</span>, which
      runs every five minutes and holds the only credential that can move money at Razorpay. This
      console cannot trigger it, so there is no retry button here — a queued refund is waiting for the
      next run, and a blocked one needs a decision recorded elsewhere, not another attempt.
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Outstanding
 * ------------------------------------------------------------------ */

function Outstanding({
  scan,
  nowMs,
  scanLimit,
}: {
  scan: RefundScan;
  nowMs: number;
  scanLimit: number;
}) {
  if (!scan.ok) {
    return (
      <Panel title="Refunds owed">
        <p className="mt-2 text-xs font-medium text-danger">{scan.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is missing, not empty. Do not read it as nothing owed.
        </p>
      </Panel>
    );
  }

  const summary = summariseRefundQueue(scan.rows, nowMs);
  const money = describeOutstandingMoney(summary);
  const wait = describeOldestWait(summary);
  const bound = describeScanBound(scan.atLeast, scanLimit);
  const standings = tallyStandings(summary);

  return (
    <Panel title="Refunds owed" subtitle={money}>
      {(wait || standings.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {standings.map((tally) => (
            <span
              key={tally.kind}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ${toneClasses(tally.tone)}`}
            >
              <span className="tabular-nums">{tally.count}</span> {tally.label}
            </span>
          ))}
          {wait && (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
              <Clock aria-hidden="true" className="h-3 w-3" />
              {wait}
            </span>
          )}
        </div>
      )}

      {scan.rows.length === 0 ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <p className="text-xs leading-relaxed text-primary/70">
            No refund is waiting to be paid in what was scanned — {scanLimit} documents deep. This is
            a real empty, not a failed read.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {scan.rows.map((row) => (
            <RefundCard key={row.id} row={row} nowMs={nowMs} />
          ))}
        </ul>
      )}

      {bound && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">{bound}</p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * Settled
 * ------------------------------------------------------------------ */

/**
 * The settled list is secondary and says so.
 *
 * It is a bounded, unordered slice of processed refunds — useful for confirming a
 * specific one landed, and explicitly not a complete ledger. It is placed after
 * the money owed because that is what an operator opens this page for.
 */
function Settled({
  scan,
  nowMs,
  scanLimit,
}: {
  scan: RefundScan;
  nowMs: number;
  scanLimit: number;
}) {
  if (!scan.ok) {
    return (
      <Panel title="Recently settled">
        <p className="mt-2 text-xs font-medium text-warning">{scan.reason}</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Recently settled"
      subtitle="Processed refunds, most recently touched first. A bounded sample for confirming one landed — not a full ledger."
    >
      {scan.rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No settled refund was found in the {scanLimit} scanned.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {scan.rows.map((row) => (
            <RefundCard key={row.id} row={row} nowMs={nowMs} />
          ))}
        </ul>
      )}
      {scan.atLeast && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
          The scan stops at {scanLimit} documents and there were more. This is a sample of settled
          refunds, not all of them.
        </p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * One refund
 * ------------------------------------------------------------------ */

/**
 * A single refund, read top to bottom: where it stands, who and how much, why it
 * exists, what (if anything) is wrong, and the references to reconcile it against.
 *
 * The amount and its certainty are inseparable here — the qualifier is rendered
 * with the figure, never tucked away — because the specific error this page must
 * not cause is an operator treating an estimate as the amount that moved.
 */
function RefundCard({ row, nowMs }: { row: AdminRefundRow; nowMs: number }) {
  const standing = refundStanding(row, nowMs);
  const amount = refundAmountDisplay(refundAmountClaim(row));
  const reason = describeRefundReason(row.reason);
  const cause = describeRefundCause(row.cause);
  const anomalies = refundAnomalies(row);
  const needsPerson = causeNeedsAPerson(row.cause);

  const client = row.booking?.clientName ?? null;
  const session =
    row.booking?.sessionDate && row.booking.sessionTime
      ? `${row.booking.sessionDate} at ${row.booking.sessionTime}`
      : null;

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={standing.tone} label={standing.label} title={standing.detail} />
          <Badge tone={reason.tone} label={reason.label} title={reason.detail} />
          {needsPerson && <Badge tone="danger" label="Needs a person" title="A retry cannot fix this." />}
        </div>
        <div className="text-right">
          <p className={`text-sm font-semibold tabular-nums ${amount.certain ? 'text-primary' : 'text-primary/70'}`}>
            {amount.text}
          </p>
          <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
            {amount.certain ? 'Refunded' : 'Estimate'}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {client ? (
          <span className="text-sm font-medium text-primary">{client}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Client name not read</span>
        )}
        {session && <span className="text-xs text-muted-foreground">· {session}</span>}
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-primary/70">{standing.detail}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-primary/60">Next:</span> {standing.next}
      </p>

      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">{amount.qualifier}</p>

      {cause && (
        <p className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${toneClasses(needsPerson ? 'danger' : 'warning')}`}>
          {cause}
        </p>
      )}

      {anomalies.length > 0 && (
        <ul className="mt-2 space-y-1">
          {anomalies.map((note) => (
            <li key={note} className="flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-warning">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        {row.bookingId && (
          <Link
            href={`/admin/bookings/${encodeURIComponent(row.bookingId)}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open booking
            <ArrowRight aria-hidden="true" className="h-3 w-3" />
          </Link>
        )}
        {row.razorpayPaymentId && <CopyableId id={row.razorpayPaymentId} label="payment id" />}
        {row.refundId && <CopyableId id={row.refundId} label="refund id" />}
      </div>
    </li>
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
      <p className="font-medium text-primary">Refunds could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a page that
        listed some refunds would read as though the rest were paid.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function RefundsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading refunds…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-64 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}




