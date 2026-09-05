'use client';

/**
 * The clients screen: one client's full history, and who has been active lately.
 *
 * There is no `clients` collection, so everything here is reconstructed from
 * bookings, and the screen is honest about the seams that creates:
 *
 *  1. **A client is an email.** Email is the one contact field normalized at
 *     write time; name and phone are not. So a profile is keyed on email, the
 *     search takes an email, and the page states plainly that one person using two
 *     emails will show up as two clients.
 *  2. **Totals are computed from all of a client's bookings; the recent list is
 *     not.** `deriveClientProfile` reads every booking for the searched email, so
 *     its counts are real. The recent list is a bounded scan collapsed by
 *     `groupRecentClients`, so it shows who is active and links to their profile —
 *     and shows no lifetime number it has not actually computed.
 *  3. **Read-only.** There is no client record to edit; to act, open a booking.
 *
 * Both aggregations run here, client-side, so the figures an operator reads are the
 * ones the tests exercise.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, RotateCcw, Search, User } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  deriveClientProfile,
  groupRecentClients,
  type ClientProfile,
  type RecentClient,
} from '@/domains/admin/clientProfile';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatAmount,
  formatCreatedAt,
  formatSessionDayLong,
  humanizeStatus,
  paymentBadge,
  statusBadge,
  toneClasses,
} from '../bookings/adminBookingPresentation';
import { CopyableId } from '../bookings/CopyableId';
import { formatRefundAmount } from '../bookings/adminBookingDetailPresentation';
import { describeUpcoming, formatPaidTotal, formatRefundTotal, identityNotes } from './clientsPresentation';
import type {
  AdminClientBookingRow,
  AdminClientProfileResult,
  AdminClientsPayload,
  RecentClientsScan,
} from './adminClientsResponse';
import { useAdminClients } from './useAdminClients';

export function ClientsScreen() {
  const [input, setInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const { data, loading, initialLoading, error, reload } = useAdminClients(activeQuery);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setActiveQuery(input.trim());
  };
  const onClear = () => {
    setInput('');
    setActiveQuery('');
  };
  // A recent-list row hands its email up here, so "View history" runs the same
  // search a typed email would — one code path, not two.
  const onSelect = (email: string) => {
    setInput(email);
    setActiveQuery(email);
  };

  if (initialLoading) return <ClientsSkeleton />;
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

      {data.profile && <ProfileResult profile={data.profile} />}

      <Recent scan={data.recent} scanLimit={data.scanLimit} onSelect={onSelect} />
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
  payload: AdminClientsPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Clients</p>
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
 * What a "client" is here, said once at the top: an aggregate over bookings, keyed
 * on email, because Saarthi never stored clients as records. The two-email caveat
 * is stated rather than hidden — it is the limitation an operator most needs to
 * carry when they read a profile as someone's whole history.
 */
function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">Clients are reconstructed from bookings.</span> A
      client is identified by the email used to book — the one contact detail normalized at signup —
      so someone who booked under two emails appears here as two clients. This screen is read-only; to
      act on a session, open its booking.
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/**
 * Search on submit, not per keystroke: a profile is a single-email lookup and
 * fires when the operator has finished typing an address, not while pasting it.
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
      <label htmlFor="clients-q" className="text-sm font-semibold text-primary">
        Find a client
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Search by the email used to book. To find someone by name, use Bookings — every booking
        carries the email you can search here.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="clients-q"
          type="email"
          value={input}
          onChange={(event) => onInput(event.target.value)}
          placeholder="client@email.com"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-3 py-2 font-mono text-sm text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button type="submit" size="sm" disabled={loading || input.trim().length === 0}>
          <Search aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Find
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
 * One client's profile
 * ------------------------------------------------------------------ */

function ProfileResult({ profile }: { profile: AdminClientProfileResult }) {
  if (!profile.ok) {
    return (
      <Panel title={`Client: ${profile.query}`}>
        <p className="mt-2 text-xs font-medium text-danger">{profile.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is a failed read, not a clean “no bookings”. The server logged why.
        </p>
      </Panel>
    );
  }
  return <Profile profile={profile} />;
}

/**
 * The aggregate, put on screen. `deriveClientProfile` runs here so the counts and
 * the paid total an operator reads come from the same function the tests exercise.
 * `Date.now()` is the "now" for classifying upcoming sessions — the browser's
 * clock, on a page that only renders client-side.
 */
function Profile({ profile }: { profile: Extract<AdminClientProfileResult, { ok: true }> }) {
  const derived = useMemo<ClientProfile>(
    () => deriveClientProfile(profile.email, profile.rows, Date.now()),
    [profile]
  );

  if (derived.total === 0) {
    return (
      <Panel title={`Client: ${profile.email}`}>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          No bookings are stored against this email. Check the spelling, or search the name in
          Bookings — the email there is the one to use.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={`Client: ${derived.email}`}>
      <ProfileIdentity profile={derived} />
      <ProfileStats profile={derived} />
      <ProfileGroups profile={derived} />

      {profile.atLeast && (
        <p className="mt-3 rounded-lg bg-warning-surface px-3 py-2 text-[0.6875rem] leading-relaxed text-warning">
          This client has more bookings than the page reads at once, so the figures above are a lower
          bound. The most recent are listed below.
        </p>
      )}

      <ProfileHistory bookings={derived.bookings} />
    </Panel>
  );
}

/** Who the client is, reconciled across their bookings, plus the honesty signals. */
function ProfileIdentity({ profile }: { profile: ClientProfile }) {
  const notes = identityNotes(profile.identity);
  return (
    <div className="mt-2 rounded-lg bg-neutral-surface px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User aria-hidden="true" className="h-4 w-4 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">
            {profile.identity.name ?? 'Name not recorded'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          {profile.identity.phone && (
            <p className="text-xs text-muted-foreground">{profile.identity.phone}</p>
          )}
        </div>
      </div>

      <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
        First seen {formatCreatedAt(profile.firstSeenIso)} · last seen{' '}
        {formatCreatedAt(profile.lastSeenIso)} {DISPLAY_TIME_ZONE_LABEL}
      </p>

      {notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((note) => (
            <li key={note} className="text-[0.6875rem] leading-relaxed text-warning">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The four figures an operator scans first: how many, how many ahead, money in, money back. */
function ProfileStats({ profile }: { profile: ClientProfile }) {
  const upcoming = describeUpcoming(profile.upcoming);
  const paid = formatPaidTotal(profile.money);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Bookings" value={String(profile.total)} />
      <Stat label="Upcoming" value={upcoming.text} hint={upcoming.note} />
      <Stat label="Paid" value={paid.text} hint={paid.caveat} />
      <Stat
        label="Refunded"
        value={profile.money.refundedCount > 0 ? formatRefundTotal(profile.money) : '—'}
        hint={
          profile.money.refundedCount > 0
            ? `Across ${profile.money.refundedCount} ${
                profile.money.refundedCount === 1 ? 'booking' : 'bookings'
              }.`
            : null
        }
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2.5">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary">{value}</p>
      {hint && <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The status breakdown, using the same groups and tones as the Bookings list, so a
 * client's "3 confirmed" means exactly what the confirmed filter there means. A
 * status the console cannot classify is shown, not dropped.
 */
function ProfileGroups({ profile }: { profile: ClientProfile }) {
  if (profile.groups.length === 0 && profile.unclassifiedCount === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {profile.groups.map((group) => (
        <span
          key={group.id}
          className={`rounded px-2 py-0.5 text-[0.6875rem] font-medium ${toneClasses(group.tone)}`}
        >
          {group.label}: {group.count}
        </span>
      ))}
      {profile.unclassifiedCount > 0 && (
        <span
          className={`rounded px-2 py-0.5 text-[0.6875rem] font-medium ${toneClasses('neutral')}`}
          title="These bookings have a status this console does not recognise."
        >
          Unrecognised status: {profile.unclassifiedCount}
        </span>
      )}
    </div>
  );
}

/**
 * Every booking for this client, session-newest first, each a link to the booking
 * detail where an operator can actually act. The row badges status and payment
 * with the shared rules; it never invents a status a booking does not have.
 */
function ProfileHistory({ bookings }: { bookings: readonly AdminClientBookingRow[] }) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Booking history
      </h4>
      <ul className="mt-2 space-y-2">
        {bookings.map((row) => (
          <BookingHistoryRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function BookingHistoryRow({ row }: { row: AdminClientBookingRow }) {
  const status = row.status ? statusBadge({ status: row.status }) : null;
  const payment = paymentBadge({ paymentStatus: row.paymentStatus });
  const session =
    row.sessionDate !== null
      ? `${formatSessionDayLong(row.sessionDate)}${row.sessionTime ? ` at ${row.sessionTime}` : ''}`
      : 'Session date not set';

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{session}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.therapistName ?? 'Therapist not recorded'}
            {row.sessionType ? ` · ${humanizeStatus(row.sessionType)}` : ''}
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-primary">
          {formatAmount(row.amountRupees, row.currency)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {status && <Badge tone={status.tone} label={status.label} title={status.title} />}
        {payment && <Badge tone={payment.tone} label={payment.label} title={payment.title} />}
        {row.refundAmountPaise !== null && row.refundAmountPaise > 0 && (
          <span className={`rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses('info')}`}>
            Refunded {formatRefundAmount(row.refundAmountPaise)}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        <Link
          href={`/admin/bookings/${encodeURIComponent(row.id)}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open booking
          <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </Link>
        <CopyableId id={row.id} label="booking id" />
        <span className="text-[0.625rem] text-muted-foreground">
          Booked {formatCreatedAt(row.createdAtIso)} {DISPLAY_TIME_ZONE_LABEL}
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Recently-active clients
 * ------------------------------------------------------------------ */

function Recent({
  scan,
  scanLimit,
  onSelect,
}: {
  scan: RecentClientsScan;
  scanLimit: number;
  onSelect: (email: string) => void;
}) {
  const clients = useMemo<readonly RecentClient[]>(
    () => (scan.ok ? groupRecentClients(scan.rows) : []),
    [scan]
  );

  if (!scan.ok) {
    return (
      <Panel title="Recently active clients">
        <p className="mt-2 text-xs font-medium text-danger">{scan.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is missing, not empty. Do not read it as no clients.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Recently active clients"
      subtitle={`Distinct clients across the ${scanLimit} most recent bookings, newest first. This is who has been active lately, not everyone — and it shows no lifetime totals, because a count taken from a recent slice would misread as one. Open a client for their full history.`}
    >
      {clients.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No client appears in the {scanLimit} most recent bookings.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {clients.map((client) => (
            <RecentClientCard key={client.email} client={client} onSelect={onSelect} />
          ))}
        </ul>
      )}
      {scan.atLeast && (
        <p className="mt-3 text-[0.625rem] leading-relaxed text-muted-foreground">
          The scan stops at {scanLimit} bookings and there were more. Clients whose most recent
          booking is older than that are reached by searching their email above.
        </p>
      )}
    </Panel>
  );
}

/**
 * One recently-active client. Unlike the payments recent list, this one carries a
 * name and email — a list of people that hid who they were would be useless — but
 * still shows no lifetime figure, only their latest booking and a way into the full
 * profile.
 */
function RecentClientCard({
  client,
  onSelect,
}: {
  client: RecentClient;
  onSelect: (email: string) => void;
}) {
  const { lastBooking } = client;
  const status = lastBooking.status ? statusBadge({ status: lastBooking.status }) : null;
  const payment = paymentBadge({ paymentStatus: lastBooking.paymentStatus });
  const session =
    lastBooking.sessionDate !== null
      ? `${formatSessionDayLong(lastBooking.sessionDate)}${
          lastBooking.sessionTime ? ` at ${lastBooking.sessionTime}` : ''
        }`
      : 'Session date not set';

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{client.name ?? 'Name not recorded'}</p>
          <p className="truncate text-xs text-muted-foreground">{client.email}</p>
        </div>
        <p className="text-[0.625rem] text-muted-foreground">
          Last active {formatCreatedAt(client.lastActiveIso)} {DISPLAY_TIME_ZONE_LABEL}
        </p>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Latest: {session}
        {lastBooking.therapistName ? ` · ${lastBooking.therapistName}` : ''}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {status && <Badge tone={status.tone} label={status.label} title={status.title} />}
        {payment && <Badge tone={payment.tone} label={payment.label} title={payment.title} />}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        <button
          type="button"
          onClick={() => onSelect(client.email)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View history
          <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </button>
        <Link
          href={`/admin/bookings/${encodeURIComponent(lastBooking.id)}`}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open latest booking
        </Link>
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
      <p className="font-medium text-primary">Clients could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a page that
        listed some clients would read as though the rest were fine.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function ClientsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading clients…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-12 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-28 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-64 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}






