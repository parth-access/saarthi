import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import {
  DEFAULT_PAGE_SIZE,
  classifyBookingLookup,
  cursorForRow,
  decodeBookingCursor,
  describeBookingLookup,
  encodeBookingCursor,
  isBookingStatusGroupId,
  isPaymentStatusGroupId,
  planAdminBookingList,
  toAdminBookingRow,
  type AdminBookingRow,
} from '@/domains/booking/queries/adminBookingQuery';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/** Bounded so one lookup can never turn into a collection scan. */
const LOOKUP_LIMIT = 25;

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

/**
 * The admin bookings list.
 *
 * Replaces the console's only booking read path, `GET /api/bookings`, which
 * called `findAll()` — `orderBy createdAt desc limit(500)` — and handed all of it
 * to the browser to filter in React. That had a correctness bug, not just a
 * performance one: booking 501 and beyond simply did not exist as far as an
 * operator could tell, and the list gave no indication it had been truncated.
 *
 * Two modes, chosen by whether a search term was typed:
 *
 *  - **list** — filtered and cursor-paginated in Firestore. The filter
 *    combination is planned by `planAdminBookingList`, which refuses anything
 *    the project has no composite index for instead of running a query that
 *    would fail or, worse, one that quietly answers a different question.
 *  - **lookup** — an exact match or prefix range on a single field. Filters do
 *    not apply, and the response says so rather than letting an operator believe
 *    their status filter narrowed the result.
 *
 * Every response carries `pageSize`, `hasMore` and `truncated` so the UI can
 * state what it is showing. Nothing is ever silently cut off.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  const params = new URL(req.url).searchParams;

  try {
    const term = params.get('q');
    if (term !== null && term.trim().length > 0) {
      const lookup = classifyBookingLookup(term);
      if (!lookup) return badRequest('Enter something to search for.');

      const bookings = await firestoreBookingRepository.lookupForAdmin(lookup, LOOKUP_LIMIT);
      const rows: AdminBookingRow[] = bookings
        .map(toAdminBookingRow)
        .sort((a, b) => (b.createdAtIso ?? '').localeCompare(a.createdAtIso ?? ''));

      return NextResponse.json(
        {
          success: true,
          mode: 'lookup' as const,
          rows,
          lookup: {
            kind: lookup.kind,
            matched: describeBookingLookup(lookup),
          },
          page: {
            pageSize: LOOKUP_LIMIT,
            hasMore: false,
            nextCursor: null,
            // A prefix search that fills the limit may well have more behind it.
            truncated: rows.length >= LOOKUP_LIMIT,
          },
        },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const statusParam = params.get('status');
    if (statusParam !== null && !isBookingStatusGroupId(statusParam)) {
      return badRequest('Unknown status filter.');
    }
    const paymentParam = params.get('payment');
    if (paymentParam !== null && !isPaymentStatusGroupId(paymentParam)) {
      return badRequest('Unknown payment filter.');
    }

    const pageSizeParam = params.get('pageSize');
    if (pageSizeParam !== null && !/^\d{1,3}$/.test(pageSizeParam)) {
      return badRequest('Page size must be a whole number.');
    }

    const cursorParam = params.get('cursor');
    const cursor = cursorParam === null ? null : decodeBookingCursor(cursorParam);
    if (cursorParam !== null && cursor === null) {
      // Never fall back to page one: an operator paging through hundreds of
      // bookings would loop over the first page and conclude the rest are gone.
      return badRequest('That page link is no longer valid. Reload the list to start again.');
    }

    const therapistParam = params.get('therapistId');
    const dateParam = params.get('date');

    const planned = planAdminBookingList({
      statusGroup: statusParam ?? undefined,
      paymentGroup: paymentParam ?? undefined,
      therapistId: therapistParam?.trim() || undefined,
      date: dateParam?.trim() || undefined,
      pageSize: pageSizeParam === null ? DEFAULT_PAGE_SIZE : Number(pageSizeParam),
      cursor,
    });

    if (!planned.ok) return badRequest(planned.message);

    const { bookings, hasMore } = await firestoreBookingRepository.findAdminPage(planned.plan);
    const rows = bookings.map(toAdminBookingRow);
    const last = rows.length > 0 ? cursorForRow(rows[rows.length - 1]) : null;

    return NextResponse.json(
      {
        success: true,
        mode: 'list' as const,
        rows,
        appliedFilters: {
          status: statusParam,
          payment: paymentParam,
          therapistId: therapistParam?.trim() || null,
          date: dateParam?.trim() || null,
        },
        page: {
          pageSize: planned.plan.pageSize,
          hasMore,
          // `hasMore` with no usable cursor would render a dead "next" button, so
          // the two are reported together and the UI keys off the cursor.
          nextCursor: hasMore && last ? encodeBookingCursor(last) : null,
          truncated: false,
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    // A missing composite index surfaces here as a Firestore FAILED_PRECONDITION
    // carrying a console URL with the project id in it. It goes to the server log,
    // never to the browser.
    logger.error('BOOKING', 'Admin bookings query failed', error, {
      query: Object.fromEntries(params.entries()),
    });
    return NextResponse.json(
      { success: false, error: 'We could not load bookings right now. Please try again.' },
      { status: 500 }
    );
  }
}
