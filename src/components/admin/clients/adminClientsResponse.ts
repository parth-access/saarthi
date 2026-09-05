/**
 * How a response from `GET /api/admin/clients` becomes what the screen shows — and
 * what it refuses to show.
 *
 * The client aggregate is computed in the browser from the rows this returns, so
 * the failure that matters is a malformed row reaching `deriveClientProfile` and
 * skewing a total, or a missing scan reading as "no clients". The rules match the
 * payments and refunds parsers:
 *
 *  - **A malformed row is not a valid row.** Every field of every booking row is
 *    narrowed; one wrong type rejects the whole payload rather than letting a
 *    `NaN` amount or an `undefined` status into a count.
 *  - **A missing scan is not an empty scan.** `recent` must be present and
 *    well-formed, so a truncated body never renders as "no recent clients".
 *  - **A 200 that says `success: false` is a failure.**
 *  - **The server's sentence wins on error**, since the route keeps raw errors in
 *    the server log and sends only safe copy.
 *
 * Kept out of the hook so the rules can be tested without a DOM.
 */
import type { AdminClientBookingRow } from '@/domains/admin/clientProfile';

export type { AdminClientBookingRow } from '@/domains/admin/clientProfile';

export {
  createLatestRequestGuard,
  type LatestRequestGuard,
} from '../bookings/adminBookingsResponse';

export type AdminClientProfileResult =
  | {
      readonly ok: true;
      readonly query: string;
      readonly email: string;
      readonly rows: readonly AdminClientBookingRow[];
      readonly atLeast: boolean;
    }
  | { readonly ok: false; readonly query: string; readonly reason: string };

export type RecentClientsScan =
  | { readonly ok: true; readonly rows: readonly AdminClientBookingRow[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

export interface AdminClientsPayload {
  readonly generatedAtIso: string;
  readonly profile: AdminClientProfileResult | null;
  readonly recent: RecentClientsScan;
  readonly scanLimit: number;
  readonly profileLimit: number;
}

export type AdminClientsInterpretation =
  | { readonly ok: true; readonly payload: AdminClientsPayload }
  | { readonly ok: false; readonly error: string };

export const GENERIC_CLIENTS_ERROR = 'We could not load clients right now. Please try again.';

export const CLIENTS_ACCESS_ERROR =
  'Your session no longer has admin access. Sign in again to continue.';

export const CLIENTS_SESSION_ERROR = 'Your session has expired. Reload the page to sign in again.';

function messageIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/** A booking row, every field narrowed. `id` is the one required field. */
function isClientRow(value: unknown): value is AdminClientBookingRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    isNullableString(row.email) &&
    isNullableString(row.name) &&
    isNullableString(row.phone) &&
    isNullableString(row.userId) &&
    isNullableString(row.therapistId) &&
    isNullableString(row.therapistName) &&
    isNullableString(row.sessionDate) &&
    isNullableString(row.sessionTime) &&
    isNullableString(row.sessionType) &&
    isNullableString(row.sessionMode) &&
    isNullableString(row.status) &&
    isNullableString(row.paymentStatus) &&
    isNullableNumber(row.amountRupees) &&
    isNullableString(row.currency) &&
    isNullableString(row.refundStatus) &&
    isNullableNumber(row.refundAmountPaise) &&
    isNullableString(row.createdAtIso) &&
    isNullableString(row.sessionStartIso)
  );
}

/**
 * A profile result, or nothing. Both branches carry `query`, so the screen can
 * title the result with the email searched even when it matched no bookings — a
 * valid `ok: true` with an empty `rows`, not an error.
 */
function isProfileResult(value: unknown): value is AdminClientProfileResult {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  if (typeof profile.query !== 'string') return false;
  if (profile.ok === true) {
    return (
      typeof profile.email === 'string' &&
      Array.isArray(profile.rows) &&
      profile.rows.every(isClientRow) &&
      typeof profile.atLeast === 'boolean'
    );
  }
  if (profile.ok === false) {
    return typeof profile.reason === 'string' && profile.reason.trim().length > 0;
  }
  return false;
}

/**
 * One scan, or an admitted failure. `atLeast` is required on success — it is what
 * stops a capped scan being read as every client the practice has.
 */
function isRecentScan(value: unknown): value is RecentClientsScan {
  if (!value || typeof value !== 'object') return false;
  const scan = value as Record<string, unknown>;
  if (scan.ok === true) {
    return (
      Array.isArray(scan.rows) && scan.rows.every(isClientRow) && typeof scan.atLeast === 'boolean'
    );
  }
  if (scan.ok === false) {
    return typeof scan.reason === 'string' && scan.reason.trim().length > 0;
  }
  return false;
}

export function interpretAdminClientsResponse(
  status: number,
  body: unknown
): AdminClientsInterpretation {
  if (status === 401 || status === 403) {
    return { ok: false, error: CLIENTS_ACCESS_ERROR };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, error: messageIn(body) ?? GENERIC_CLIENTS_ERROR };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, error: GENERIC_CLIENTS_ERROR };
  }
  const candidate = body as Record<string, unknown>;

  if (candidate.success === false) {
    return { ok: false, error: messageIn(body) ?? GENERIC_CLIENTS_ERROR };
  }

  if (
    typeof candidate.generatedAtIso !== 'string' ||
    typeof candidate.scanLimit !== 'number' ||
    typeof candidate.profileLimit !== 'number' ||
    !isRecentScan(candidate.recent) ||
    !(candidate.profile === null || isProfileResult(candidate.profile))
  ) {
    return { ok: false, error: GENERIC_CLIENTS_ERROR };
  }

  return {
    ok: true,
    payload: {
      generatedAtIso: candidate.generatedAtIso,
      profile: candidate.profile as AdminClientProfileResult | null,
      recent: candidate.recent as RecentClientsScan,
      scanLimit: candidate.scanLimit,
      profileLimit: candidate.profileLimit,
    },
  };
}

