'use client';

/**
 * The payments screen: one payment seen from both sides, and the recent gateway
 * orders.
 *
 * It does one honest thing — put the `payments` document and the booking beside
 * each other so their disagreements show — and it refuses to do more:
 *
 *  1. **Read-only, and it says so.** Capturing or refunding money is driven by the
 *     checkout flow and the refunds job, which hold gateway credentials a browser
 *     session does not. There is no action button here that would move money on a
 *     misclick; the note says where those live.
 *  2. **A trace states disagreement, it does not smooth it.** `reconcilePayment`
 *     runs here, client-side, over the two raw sides, so the reconciliation the
 *     tests exercise is the one the operator reads.
 *  3. **The recent list is not the ledger.** Only gateway-order payments appear;
 *     a link, mock or legacy payment has no document, so the panel says the list
 *     is not every paid session and admits the scan bound.
 *  4. **The bulk list carries no PII.** Only a named trace — an id an operator
 *     pasted — shows a client's name and email; the recent list never does.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { reconcilePayment, type PaymentTrace } from '@/domains/admin/paymentTrace';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatAmount,
  formatCreatedAt,
  formatSessionDayLong,
  humanizeStatus,
  paymentBadge,
  toneClasses,
} from '../bookings/adminBookingPresentation';
import { CopyableId } from '../bookings/CopyableId';
import {
  describeCapture,
  describeDiscrepancy,
  describePresence,
  describeReceipt,
  describeRefund,
} from './paymentsPresentation';
import type {
  AdminPaymentBooking,
  AdminPaymentOrderRow,
  AdminPaymentsPayload,
  AdminPaymentTraceResult,
  PaymentScan,
} from './adminPaymentsResponse';
import { useAdminPayments } from './useAdminPayments';

export function PaymentsScreen() {
  const [input, setInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const { data, loading, initialLoading, error, reload } = useAdminPayments(activeQuery);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setActiveQuery(input.trim());
  };
  const onClear = () => {
    setInput('');
    setActiveQuery('');
  };

  if (initialLoading) return <PaymentsSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  return (
    <div className="space-y-3">
      <Reading payload={data} loading={loading} onReload={reload} />

      {error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error} What you see below was
          read at {formatCreatedAt(data.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}.
        </Notice>
      )}

      <DrivenBy />

      <SearchBar
        input={input}
        active={activeQuery}
        loading={loading}
        onInput={setInput}
        onSubmit={onSubmit}
        onClear={onClear}
      />

      {data.trace && <TraceResult trace={data.trace} />}

      <Recent scan={data.recent} scanLimit={data.scanLimit} />
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
  payload: AdminPaymentsPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Payments</p>
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
 * Who moves money — which is not the person reading this. Stated once, at the top,
 * so an operator is not left hunting for a capture or refund button that is
 * deliberately absent.
 */
function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">This screen is read-only.</span> Capturing a payment
      is driven by the checkout flow and refunds by the scheduled job — both hold gateway credentials
      a browser session does not. To act on a payment, open its booking or the Refunds section; there
      is no control here that would move money.
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/**
 * Search on submit, not per keystroke: a trace is a single-id lookup that runs
 * three Firestore reads, so it fires when the operator has finished typing an id,
 * not while they are still pasting it.
 */
function SearchBar({
  input,
  active,
  loading,
  onInput,
  onSubmit,
  onClear,
}: {
  input: string;
  active: string;
  loading: boolean;
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onClear: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <label htmlFor="payments-q" className="text-sm font-semibold text-primary">
        Trace a payment
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Paste a Razorpay order id (order_…), a payment id (pay_…) or a booking id to see the gateway
        document and the booking side by side.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="payments-q"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          placeholder="order_… / pay_… / booking id"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button type="submit" size="sm" disabled={loading || input.trim().length === 0}>
          <Search aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Trace
        </Button>
        {active && (
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * The trace
 * ------------------------------------------------------------------ */

function TraceResult({ trace }: { trace: AdminPaymentTraceResult }) {
  if (!trace.ok) {
    return (
      <Panel title={`Trace: ${trace.query}`}>
        <p className="mt-2 text-xs font-medium text-danger">{trace.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is a failed read, not a clean “nothing found”. The server logged why.
        </p>
      </Panel>
    );
  }
  return <TraceBody trace={trace} />;
}

/**
 * The reconciliation, put on screen. `reconcilePayment` runs here so the words an
 * operator reads come from the same function the tests exercise — the presence,
 * the capture verdict, every disagreement, the receipt and any refund.
 */
function TraceBody({ trace }: { trace: Extract<AdminPaymentTraceResult, { ok: true }> }) {
  const result = useMemo<PaymentTrace>(
    () => reconcilePayment(trace.payment, trace.booking, trace.receiptNumber),
    [trace]
  );

  const headline = describePresence(result.presence);
  const capture = describeCapture(result.capture);
  const receipt = describeReceipt(result.receipt);
  const refund = describeRefund(result.refund);

  const { booking, payment } = trace;
  const orderId = booking?.razorpayOrderId ?? payment?.razorpayOrderId ?? payment?.orderId ?? null;
  const paymentId = booking?.razorpayPaymentId ?? payment?.razorpayPaymentId ?? null;

  return (
    <Panel title={`Trace: ${trace.query}`}>
      <div className={`mt-2 rounded-lg px-3 py-2.5 ${toneClasses(headline.tone)}`}>
        <p className="text-sm font-semibold">{headline.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed">{headline.detail}</p>
      </div>

      {result.presence === 'neither' ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Check the id and try again. A trace takes a Razorpay order id (order_…), a payment id
          (pay_…) or a booking id.
        </p>
      ) : (
        <TraceLines
          booking={booking}
          capture={capture}
          discrepancies={result.discrepancies}
          agreed={result.presence === 'both' && result.discrepancies.length === 0}
          receiptText={receipt.text}
          refundText={refund}
          bookingId={booking?.id ?? null}
          orderId={orderId}
          paymentId={paymentId}
        />
      )}
    </Panel>
  );
}

/**
 * Everything below the presence headline, in the order an operator reads a trace:
 * who it is, whether money was taken, every way the two records disagree, then the
 * receipt and refund standing, then the references to reconcile against.
 */
function TraceLines({
  booking,
  capture,
  discrepancies,
  agreed,
  receiptText,
  refundText,
  bookingId,
  orderId,
  paymentId,
}: {
  booking: AdminPaymentBooking | null;
  capture: ReturnType<typeof describeCapture>;
  discrepancies: PaymentTrace['discrepancies'];
  agreed: boolean;
  receiptText: string;
  refundText: string | null;
  bookingId: string | null;
  orderId: string | null;
  paymentId: string | null;
}) {
  return (
    <>
      {booking && <Identity booking={booking} />}

      <div className="mt-3 space-y-2">
        <ToneBox tone={capture.tone}>
          <span className="font-medium">{capture.label}.</span> {capture.detail}
        </ToneBox>

        {discrepancies.map((discrepancy, index) => {
          const line = describeDiscrepancy(discrepancy);
          return (
            <ToneBox key={`${discrepancy.kind}-${index}`} tone={line.tone}>
              {line.text}
            </ToneBox>
          );
        })}

        {agreed && (
          <ToneBox tone="success">
            The gateway document and the booking agree on amount, capture and identifiers.
          </ToneBox>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-primary/70">{receiptText}</p>
      {refundText && <p className="mt-1 text-xs leading-relaxed text-primary/70">{refundText}</p>}

      {(bookingId || orderId || paymentId) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
          {bookingId && (
            <Link
              href={`/admin/bookings/${encodeURIComponent(bookingId)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Open booking
              <ArrowRight aria-hidden="true" className="h-3 w-3" />
            </Link>
          )}
          {orderId && <CopyableId id={orderId} label="order id" />}
          {paymentId && <CopyableId id={paymentId} label="payment id" />}
        </div>
      )}
    </>
  );
}

/**
 * The client behind a traced payment. Shown only on a named trace — the operator
 * pasted a specific id — which is where the booking detail view already carries a
 * name and email; the recent list below never does.
 */
function Identity({ booking }: { booking: AdminPaymentBooking }) {
  const session =
    booking.sessionDate && booking.sessionTime
      ? `${formatSessionDayLong(booking.sessionDate)} at ${booking.sessionTime}`
      : null;
  const kind = [booking.sessionType ? humanizeStatus(booking.sessionType) : null, session]
    .filter((part): part is string => !!part)
    .join(' · ');

  return (
    <div className="mt-3 rounded-lg bg-neutral-surface px-3 py-2.5">
      <p className="text-sm font-medium text-primary">
        {booking.clientName ?? 'Client name not read'}
      </p>
      {booking.clientEmail && (
        <p className="text-xs text-muted-foreground">{booking.clientEmail}</p>
      )}
      {kind && <p className="mt-0.5 text-xs text-muted-foreground">{kind}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Recent gateway orders
 * ------------------------------------------------------------------ */

function Recent({ scan, scanLimit }: { scan: PaymentScan; scanLimit: number }) {
  if (!scan.ok) {
    return (
      <Panel title="Recent gateway orders">
        <p className="mt-2 text-xs font-medium text-danger">{scan.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is missing, not empty. Do not read it as no payments.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Recent gateway orders"
      subtitle="Newest first. Only payments made through the gateway-order flow appear here — a link, mock or legacy payment has none — so this is not every paid session."
    >
      {scan.rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No gateway order was found in the {scanLimit} scanned.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {scan.rows.map((row) => (
            <OrderCard key={row.orderId} row={row} />
          ))}
        </ul>
      )}
      {scan.atLeast && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
          The scan stops at {scanLimit} documents and there were more. This is the most recent
          {` ${scanLimit}`}, not all of them.
        </p>
      )}
    </Panel>
  );
}

/**
 * One recent gateway order. Gateway-order fields only — no client name or email —
 * because this is a bulk list. To see who a payment belongs to, trace it.
 */
function OrderCard({ row }: { row: AdminPaymentOrderRow }) {
  const badge = paymentBadge({ paymentStatus: row.status });
  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {badge && <Badge tone={badge.tone} label={badge.label} title={badge.title} />}
          {row.source && (
            <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
              {humanizeStatus(row.source)}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold tabular-nums text-primary">
          {formatAmount(row.amountRupees, row.currency)}
        </p>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Created {formatCreatedAt(row.createdAtIso)} {DISPLAY_TIME_ZONE_LABEL}
      </p>

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
        <CopyableId id={row.orderId} label="order id" />
        {row.razorpayPaymentId && <CopyableId id={row.razorpayPaymentId} label="payment id" />}
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

/**
 * One reconciliation line, tinted by its tone. The tone is carried by the
 * background *and* by the words inside it, never by colour alone — a danger reads
 * as a danger to someone who cannot see the tint.
 */
function ToneBox({ tone, children }: { tone: AdminTone; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${toneClasses(tone)}`}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      {children}
    </p>
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
      <p className="font-medium text-primary">Payments could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a page that
        listed some payments would read as though the rest were fine.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function PaymentsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading payments…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-12 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-24 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-64 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
