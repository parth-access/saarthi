'use client';

/**
 * The bookings table, and the same rows as cards on a narrow screen.
 *
 * The column order follows how an operator reads a row: *when is the session*,
 * *who is it for*, *what state is it in*, *was it paid*, *can they join*, *when
 * was it booked*. The booking id is last and monospaced with a copy button,
 * because its only job is to be pasted into a search or a message.
 *
 * Every cell goes through `adminBookingPresentation`, which is where the rules
 * about absent values live: a missing amount is an em dash, never `₹0`, and a
 * missing timestamp is an em dash, never `Invalid Date`.
 *
 * The session cell is the link to the booking. It is a link and not a row-wide
 * click handler so that the email, phone and copy-id controls inside the row stay
 * usable, and so an operator can open a booking in a new tab — which is what
 * working through a list of them actually looks like.
 *
 * There is still no row-level action menu. Actions arrive wired to the existing
 * booking commands; a menu of buttons that do nothing would be worse than none,
 * because an operator would plan around it.
 */
import { Video, VideoOff } from 'lucide-react';
import Link from 'next/link';
import type { AdminBookingRow } from '@/domains/booking/queries/adminBookingQuery';
import { CopyableId } from './CopyableId';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatAmount,
  formatCreatedAt,
  formatSessionDay,
  formatSessionKind,
  meetIndicator,
  paymentBadge,
  rowFlags,
  statusBadge,
  toneClasses,
} from './adminBookingPresentation';

interface BookingsTableProps {
  readonly rows: readonly AdminBookingRow[];
  /** Therapist id → display name. A missing id renders as the id itself. */
  readonly therapistNames: Record<string, string>;
  /** Dims the rows while a newer page is loading, without removing them. */
  readonly refreshing: boolean;
}

const HEAD_CLASSES =
  'px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/50';

export function bookingDetailHref(id: string): string {
  return `/admin/bookings/${encodeURIComponent(id)}`;
}

export function BookingsTable({ rows, therapistNames, refreshing }: BookingsTableProps) {
  const therapistName = (id: string) => therapistNames[id] ?? id ?? '—';

  return (
    <div
      className={refreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}
      aria-busy={refreshing}
    >
      {/* Desktop: one dense row per booking. */}
      <div className="hidden overflow-x-auto rounded-xl border border-hairline bg-white shadow-sm lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Bookings, newest first. Times are shown in {DISPLAY_TIME_ZONE_LABEL}.
          </caption>
          <thead className="border-b border-hairline bg-neutral-surface/60">
            <tr>
              <th scope="col" className={HEAD_CLASSES}>Session</th>
              <th scope="col" className={HEAD_CLASSES}>Client</th>
              <th scope="col" className={HEAD_CLASSES}>Therapist</th>
              <th scope="col" className={HEAD_CLASSES}>Status</th>
              <th scope="col" className={`${HEAD_CLASSES} text-right`}>Payment</th>
              <th scope="col" className={HEAD_CLASSES}>Meet</th>
              <th scope="col" className={HEAD_CLASSES}>Booked</th>
              <th scope="col" className={HEAD_CLASSES}>Booking id</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-hairline/70 last:border-0 align-top hover:bg-neutral-surface/40">
                <td className="px-3 py-2.5">
                  <Link
                    href={bookingDetailHref(row.id)}
                    className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {formatSessionDay(row.date)}
                    <span className="sr-only"> — open this booking</span>
                  </Link>
                  <p className="tabular text-xs text-muted-foreground">
                    {row.time || '—'} {DISPLAY_TIME_ZONE_LABEL}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatSessionKind(row)}</p>
                </td>
                <td className="px-3 py-2.5">
                  <ClientCell row={row} />
                </td>
                <td className="px-3 py-2.5 text-primary/80">{therapistName(row.therapistId)}</td>
                <td className="px-3 py-2.5">
                  <StatusCell row={row} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <PaymentCell row={row} />
                </td>
                <td className="px-3 py-2.5">
                  <MeetCell row={row} />
                </td>
                <td className="px-3 py-2.5 tabular whitespace-nowrap text-xs text-muted-foreground">
                  {formatCreatedAt(row.createdAtIso)}
                </td>
                <td className="px-3 py-2.5">
                  <CopyableId id={row.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Narrow screens: the same facts, stacked. A horizontally scrolling
          eight-column table on a phone hides the columns that matter most. */}
      <ul className="space-y-2 lg:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-hairline bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={bookingDetailHref(row.id)}
                  className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {formatSessionDay(row.date)} · {row.time || '—'} {DISPLAY_TIME_ZONE_LABEL}
                  <span className="sr-only"> — open this booking</span>
                </Link>
                <p className="text-xs text-muted-foreground">{formatSessionKind(row)}</p>
              </div>
              <StatusCell row={row} />
            </div>

            <div className="mt-2.5 border-t border-hairline pt-2.5">
              <ClientCell row={row} />
            </div>

            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-hairline pt-2.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Therapist</dt>
                <dd className="text-primary/80">{therapistName(row.therapistId)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Payment</dt>
                <dd><PaymentCell row={row} /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Meet</dt>
                <dd><MeetCell row={row} /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Booked ({DISPLAY_TIME_ZONE_LABEL})</dt>
                <dd className="tabular text-primary/80">{formatCreatedAt(row.createdAtIso)}</dd>
              </div>
            </dl>

            <div className="mt-2.5 border-t border-hairline pt-2.5">
              <CopyableId id={row.id} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Name, email and phone together, because an operator matching a row to a phone
 * call needs all three. Nothing wider than that is in the row: the client's
 * free-text message and the Meet link belong to the detail view, where the
 * access is to one named booking rather than to a page of everybody's details.
 */
function ClientCell({ row }: { row: AdminBookingRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-primary">{row.clientName || '—'}</p>
      {row.clientEmail ? (
        <a
          href={`mailto:${row.clientEmail}`}
          className="block truncate text-xs text-primary/70 underline-offset-2 hover:underline"
        >
          {row.clientEmail}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">No email stored</p>
      )}
      {row.clientPhone && (
        <a href={`tel:${row.clientPhone}`} className="tabular block truncate text-xs text-primary/70 underline-offset-2 hover:underline">
          {row.clientPhone}
        </a>
      )}
    </div>
  );
}

function StatusCell({ row }: { row: AdminBookingRow }) {
  const badge = statusBadge(row);
  const flags = rowFlags(row);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge label={badge.label} tone={badge.tone} title={badge.title} />
      {flags.map((flag) => (
        <Badge key={flag.label} label={flag.label} tone={flag.tone} title={flag.title} />
      ))}
    </div>
  );
}

function PaymentCell({ row }: { row: AdminBookingRow }) {
  const badge = paymentBadge(row);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="tabular font-medium text-primary">
        {formatAmount(row.amountRupees, row.currency)}
      </span>
      {badge ? (
        <Badge label={badge.label} tone={badge.tone} title={badge.title} />
      ) : (
        <span
          className="text-xs text-muted-foreground"
          title="No payment status is stored on this booking."
        >
          —
        </span>
      )}
    </div>
  );
}

function MeetCell({ row }: { row: AdminBookingRow }) {
  const indicator = meetIndicator(row);
  if (indicator.presence === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success" title={indicator.title}>
        <Video aria-hidden="true" className="h-3.5 w-3.5" />
        {indicator.label}
      </span>
    );
  }
  if (indicator.presence === 'missing') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-danger-surface px-1.5 py-0.5 text-xs font-medium text-danger" title={indicator.title}>
        <VideoOff aria-hidden="true" className="h-3.5 w-3.5" />
        {indicator.label}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" title={indicator.title}>
      {indicator.label}
    </span>
  );
}

function Badge({ label, tone, title }: { label: string; tone: Parameters<typeof toneClasses>[0]; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium ${toneClasses(tone)}`}
    >
      {label}
    </span>
  );
}
