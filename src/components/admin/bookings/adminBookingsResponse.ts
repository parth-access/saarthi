/**
 * How a response from `GET /api/admin/bookings` is turned into what the screen
 * shows, and how a response that lost a race is discarded.
 *
 * Both live outside the hook so they can be tested: this project has no DOM test
 * environment, and these are the two pieces of the fetch path that can put the
 * wrong thing in front of an operator.
 *
 *  - **Interpretation.** A 400 from this endpoint explains which filter
 *    combination has no index; replacing that with "Something went wrong" leaves
 *    an operator with no way to proceed. The route composes its own copy for 500s
 *    too — raw Firestore errors, which carry the project id and an index-creation
 *    URL, stay in the server log — so the body's message is safe to display as
 *    written. A body that is *not* the shape this screen expects falls back to a
 *    generic message rather than rendering half a table.
 *  - **Sequencing.** Filter clicks and searches issue overlapping requests. If a
 *    slow earlier response is allowed to commit after a newer one, the table
 *    settles on the answer to a question the operator has already moved on from,
 *    and nothing on screen says so. Abort signals are not enough on their own: a
 *    response already parsed when the abort lands still resolves.
 */
import type { AdminBookingRow, BookingLookupKind } from '@/domains/booking/queries/adminBookingQuery';

export interface AdminBookingsPage {
  readonly pageSize: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  /** A lookup that filled its limit. There may be more; how many is unknown. */
  readonly truncated: boolean;
}

export interface AdminBookingsAppliedFilters {
  readonly status: string | null;
  readonly payment: string | null;
  readonly therapistId: string | null;
  readonly date: string | null;
}

export interface AdminBookingsPayload {
  readonly mode: 'list' | 'lookup';
  readonly rows: readonly AdminBookingRow[];
  readonly page: AdminBookingsPage;
  /** Present in list mode: what the server says it filtered on. */
  readonly appliedFilters?: AdminBookingsAppliedFilters;
  /** Present in lookup mode: which field was searched, and its caveats. */
  readonly lookup?: { readonly kind: BookingLookupKind; readonly matched: string };
}

export type AdminBookingsInterpretation =
  | { readonly ok: true; readonly payload: AdminBookingsPayload }
  | { readonly ok: false; readonly error: string };

export const GENERIC_BOOKINGS_ERROR =
  'We could not load bookings right now. Please try again.';

export const BOOKINGS_ACCESS_ERROR =
  'Your session no longer has admin access. Sign in again to continue.';

export const BOOKINGS_SESSION_ERROR =
  'Your session has expired. Reload the page to sign in again.';

/** The `error` string a response body carries, if it carries a usable one. */
function messageIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function isPage(value: unknown): value is AdminBookingsPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.pageSize === 'number' &&
    typeof page.hasMore === 'boolean' &&
    typeof page.truncated === 'boolean' &&
    (page.nextCursor === null || typeof page.nextCursor === 'string')
  );
}

/**
 * `status` and the parsed body — deliberately not a `Response`, so the rules are
 * assertable without constructing HTTP.
 *
 * `body` is `null` for a response that was not JSON at all (a proxy error page,
 * say), which tells an operator nothing and becomes the generic message.
 */
export function interpretAdminBookingsResponse(
  status: number,
  body: unknown
): AdminBookingsInterpretation {
  if (status === 401 || status === 403) {
    return { ok: false, error: BOOKINGS_ACCESS_ERROR };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: messageIn(body) ?? GENERIC_BOOKINGS_ERROR };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: GENERIC_BOOKINGS_ERROR };
  }
  const candidate = body as Record<string, unknown>;

  // A 200 that says it failed is still a failure. Trusting the status alone here
  // would render an empty table as though the query had returned nothing.
  if (candidate.success === false) {
    return { ok: false, error: messageIn(body) ?? GENERIC_BOOKINGS_ERROR };
  }
  if (!Array.isArray(candidate.rows) || !isPage(candidate.page)) {
    return { ok: false, error: GENERIC_BOOKINGS_ERROR };
  }
  if (candidate.mode !== 'list' && candidate.mode !== 'lookup') {
    return { ok: false, error: GENERIC_BOOKINGS_ERROR };
  }

  return {
    ok: true,
    payload: {
      mode: candidate.mode,
      rows: candidate.rows as readonly AdminBookingRow[],
      page: candidate.page,
      appliedFilters: candidate.appliedFilters as AdminBookingsAppliedFilters | undefined,
      lookup: candidate.lookup as AdminBookingsPayload['lookup'],
    },
  };
}

export interface LatestRequestGuard {
  /** Claims the next ticket. Everything issued before it is now stale. */
  begin(): number;
  /** Whether this ticket is still the newest one issued. */
  isCurrent(ticket: number): boolean;
}

/**
 * Monotonic tickets, so only the newest request may commit.
 *
 * Checked twice in the hook — once after the response arrives and once after its
 * body is parsed — because a newer request can be issued in between.
 */
export function createLatestRequestGuard(): LatestRequestGuard {
  let latest = 0;
  return {
    begin: () => ++latest,
    isCurrent: (ticket: number) => ticket === latest,
  };
}
