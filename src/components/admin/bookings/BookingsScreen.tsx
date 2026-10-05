'use client';

/**
 * The bookings screen: filters in the URL, a page of rows from Firestore, and a
 * plain statement of what is being shown.
 *
 * The notices are the substance of this component, not decoration. Each one
 * exists because the alternative is a table an operator would reasonably
 * misread:
 *
 *  - a link carrying a filter this build does not know is *named*, because
 *    silently ignoring it would present the unfiltered list as the answer;
 *  - a search says that filters do not apply, because the API cannot combine
 *    them and the filter bar's own state would otherwise imply it did;
 *  - a lookup that filled its limit says so, because 25 results out of an
 *    unknown total must not read as "these are all of them";
 *  - an empty unfiltered list mentions that ordering is by `createdAt`, since a
 *    document without that field is genuinely absent from this view.
 */
import { AlertTriangle, ChevronRight, Info, RotateCcw, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { useTherapists } from '@/hooks/useTherapists';
import {
  BOOKING_STATUS_GROUPS,
  PAYMENT_STATUS_GROUPS,
} from '@/domains/booking/queries/adminBookingQuery';
import { BookingsFilterBar } from './BookingsFilterBar';
import { BookingsTable } from './BookingsTable';
import { formatSessionDayLong } from './adminBookingPresentation';
import {
  adminBookingsUrlQuery,
  describeActiveFilters,
  effectivePageSize,
  isLookupView,
  parseAdminBookingsView,
  withCursor,
  withFilters,
  withoutFilter,
  type AdminBookingsView,
} from './adminBookingsUrlState';
import { useAdminBookings } from './useAdminBookings';

export function BookingsScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/bookings';

  const { view, ignored } = useMemo(
    () => parseAdminBookingsView(new URLSearchParams(searchParams?.toString() ?? '')),
    [searchParams]
  );

  const { data, loading, initialLoading, error, reload } = useAdminBookings(view);
  const { therapists, loading: therapistsLoading } = useTherapists();

  const therapistNames = useMemo(
    () => Object.fromEntries(therapists.map((therapist) => [therapist.id, therapist.name])),
    [therapists]
  );

  // Every state change is a URL, so each is a real history entry the Back button
  // understands and a link an operator can paste into a message. A control whose
  // click would produce the URL already showing is skipped rather than pushed:
  // otherwise Back has to be pressed twice to get past an entry nothing changed.
  const currentQuery = searchParams?.toString() ?? '';
  const go = useCallback(
    (next: AdminBookingsView) => {
      const query = adminBookingsUrlQuery(next);
      if (query === currentQuery) return;
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [currentQuery, pathname, router]
  );

  const chips = describeActiveFilters(view, {
    status: BOOKING_STATUS_GROUPS.find((group) => group.id === view.statusGroup)?.label,
    payment: PAYMENT_STATUS_GROUPS.find((group) => group.id === view.paymentGroup)?.label,
    therapistName: view.therapistId ? therapistNames[view.therapistId] : undefined,
    date: view.date ? formatSessionDayLong(view.date) : undefined,
  });

  const rows = data?.rows ?? [];
  const lookup = isLookupView(view);
  const onFirstPage = view.cursor === null;

  return (
    <div className="space-y-3">
      <BookingsFilterBar
        view={view}
        therapists={therapists}
        therapistsLoading={therapistsLoading}
        onChange={(patch) => go(withFilters(view, patch))}
      />

      {ignored.length > 0 && (
        <Notice tone="warning" icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}>
          This link asked for {ignored.map((name) => `“${name}”`).join(', ')}, which this console
          could not read, so {ignored.length === 1 ? 'it was' : 'they were'} not applied. What you
          see below is <strong>not</strong> filtered by {ignored.length === 1 ? 'it' : 'them'}.
        </Notice>
      )}

      {lookup && (
        <Notice tone="info" icon={<Info aria-hidden="true" className="h-4 w-4" />}>
          Showing a search for <strong>{view.term}</strong>
          {data?.lookup ? ` — ${data.lookup.matched}` : ''} Status, payment, therapist and date
          filters do not apply to a search.{' '}
          <button
            type="button"
            onClick={() => go(withFilters(view, { term: null }))}
            className="font-medium underline underline-offset-2"
          >
            Clear the search
          </button>{' '}
          to filter the full list.
        </Notice>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.field}
              className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-2.5 pr-1 text-xs text-primary shadow-sm ring-1 ring-hairline"
            >
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className="font-medium">{chip.value}</span>
              <button
                type="button"
                onClick={() => go(withoutFilter(view, chip.field))}
                aria-label={`Remove the ${chip.label} filter`}
                className="rounded-full p-0.5 text-primary/50 hover:bg-neutral-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => go(withFilters(view, { statusGroup: null, paymentGroup: null, therapistId: null, date: null }))}
            className="rounded-full px-2 py-1 text-xs text-primary/70 underline underline-offset-2 hover:text-primary"
          >
            Clear all
          </button>
        </div>
      )}

      {data?.page.truncated && (
        <Notice tone="warning" icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}>
          This search returned the first {data.page.pageSize} matches and there may be more. Narrow
          it with an exact booking id, email address or order id to be certain you are looking at
          the right one.
        </Notice>
      )}

      {error && (
        <Notice tone="danger" icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}>
          <span className="block">{error}</span>
          <Button variant="outline" size="sm" className="mt-2" onClick={reload}>
            <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </Notice>
      )}

      {initialLoading && !error ? (
        <TableSkeleton />
      ) : rows.length > 0 ? (
        <BookingsTable
          rows={rows}
          therapistNames={therapistNames}
          refreshing={loading}
        />
      ) : !error ? (
        <EmptyState
          lookup={lookup}
          term={view.term}
          matched={data?.lookup?.matched ?? null}
          hasFilters={chips.length > 0}
          // A cursor can outlive its rows — bookings move between pages as new
          // ones arrive — so an empty page needs its own way back to the start,
          // since the footer that normally carries it is not rendered.
          pagedPastTheEnd={!lookup && !onFirstPage}
          onFirstPage={() => go(withCursor(view, null))}
          onClearFilters={() => go(withFilters(view, { statusGroup: null, paymentGroup: null, therapistId: null, date: null, term: null }))}
        />
      ) : null}

      {rows.length > 0 && (
        <footer className="flex flex-col gap-2 rounded-xl border border-hairline bg-white px-3 py-2.5 text-xs shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            Showing <span className="tabular font-medium text-primary">{rows.length}</span>{' '}
            {rows.length === 1 ? 'booking' : 'bookings'}
            {lookup
              ? ' matching this search.'
              : `, newest first, ${effectivePageSize(view)} per page.`}
            {!lookup && !onFirstPage && ' Continuing from the previous page.'}
          </p>
          {!lookup && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={onFirstPage}
                onClick={() => go(withCursor(view, null))}
              >
                First page
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data?.page.nextCursor || loading}
                onClick={() => data?.page.nextCursor && go(withCursor(view, data.page.nextCursor))}
              >
                {loading ? 'Loading…' : 'Next page'}
                <ChevronRight aria-hidden="true" className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </footer>
      )}
    </div>
  );
}

const NOTICE_TONES = {
  info: 'bg-info-surface text-info',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
} as const;

function Notice({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof NOTICE_TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${NOTICE_TONES[tone]}`}
    >
      <span className="mt-px shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A skeleton rather than a spinner, and only on the very first load. A refetch
 * keeps the previous rows on screen dimmed, because blanking the table on every
 * filter change reads as data disappearing.
 */
function TableSkeleton() {
  return (
    <div className="rounded-xl border border-hairline bg-white p-3 shadow-sm" aria-busy="true">
      <p className="sr-only">Loading bookings…</p>
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="h-9 flex-1 animate-pulse rounded-lg bg-neutral-surface" />
            <div className="hidden h-9 w-40 animate-pulse rounded-lg bg-neutral-surface sm:block" />
            <div className="hidden h-9 w-24 animate-pulse rounded-lg bg-neutral-surface lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Why there are no rows, distinguished.
 *
 * "No results" from a case-sensitive prefix search means something different from
 * "no results" on an exact id, and both mean something different from an empty
 * collection. Collapsing the three into one message is how an operator concludes
 * a booking does not exist when it does.
 */
function EmptyState({
  lookup,
  term,
  matched,
  hasFilters,
  pagedPastTheEnd,
  onFirstPage,
  onClearFilters,
}: {
  lookup: boolean;
  term: string | null;
  matched: string | null;
  hasFilters: boolean;
  pagedPastTheEnd: boolean;
  onFirstPage: () => void;
  onClearFilters: () => void;
}) {
  if (pagedPastTheEnd) {
    return (
      <div className="rounded-xl border border-hairline bg-white px-4 py-8 text-center shadow-sm">
        <p className="font-medium text-primary">This page is empty now</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          The page you were continuing from has no rows after it any more. That happens when
          bookings shift position as new ones are created. Start again from the newest.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onFirstPage}>
          Back to the first page
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-8 text-center shadow-sm">
      {lookup ? (
        <>
          <p className="font-medium text-primary">Nothing matched “{term}”</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            {matched ?? 'The term was matched against one field.'} A booking that exists can still
            be missed here — try the exact booking id or the email address used to book.
          </p>
        </>
      ) : hasFilters ? (
        <>
          <p className="font-medium text-primary">No bookings match these filters</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The query ran and returned nothing. The filters above are what narrowed it.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onClearFilters}>
            Clear the filters
          </Button>
        </>
      ) : (
        <>
          <p className="font-medium text-primary">No bookings to show</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            This list is ordered by when a booking was created, so a document without a creation
            timestamp would not appear here even though it exists. Search by booking id or email to
            reach one directly.
          </p>
        </>
      )}
    </div>
  );
}
