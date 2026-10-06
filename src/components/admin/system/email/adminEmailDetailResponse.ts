/**
 * Interpreting `GET /api/admin/emails/[emailId]` — one email's dispatch history
 * and plaintext backup. A 404 is a fact (no such log entry), not a retryable
 * failure, which is why it gets its own verdict.
 */
import type { EmailAttemptRow, EmailLogDetail } from '@/domains/admin/emailTriage';

export const GENERIC_EMAIL_DETAIL_ERROR =
  'We could not load this email just now. Please try again.';

export { createLatestRequestGuard, type LatestRequestGuard } from '../../bookings/adminBookingsResponse';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseAttempts(value: unknown): EmailAttemptRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((attempt, index) => {
    const record = (typeof attempt === 'object' && attempt !== null ? attempt : {}) as Record<string, unknown>;
    const response = (typeof record.response === 'object' && record.response !== null ? record.response : {}) as Record<string, unknown>;
    return {
      attemptNumber: typeof record.attemptNumber === 'number' ? record.attemptNumber : index + 1,
      attemptedAtIso: typeof record.attemptedAtIso === 'string' ? record.attemptedAtIso : null,
      status: typeof record.status === 'string' ? record.status : 'unknown',
      error: typeof record.error === 'string' && record.error ? record.error : null,
      responseId: typeof record.responseId === 'string' && record.responseId ? record.responseId : null,
    };
  });
}

export type AdminEmailDetailInterpretation =
  | { readonly ok: true; readonly email: EmailLogDetail }
  | { readonly ok: false; readonly kind: 'not-found' | 'error'; readonly error: string };

export function interpretAdminEmailDetailResponse(
  status: number,
  body: unknown
): AdminEmailDetailInterpretation {
  const record = asRecord(body);
  if (status === 401) {
    return { ok: false, kind: 'error', error: 'Your session has expired. Sign in again.' };
  }
  if (status === 404) {
    return {
      ok: false,
      kind: 'not-found',
      error: record && typeof record.error === 'string' ? record.error : GENERIC_EMAIL_DETAIL_ERROR,
    };
  }
  if (status !== 200 || !record || record.success !== true) {
    return {
      ok: false,
      kind: 'error',
      error: record && typeof record.error === 'string' ? record.error : GENERIC_EMAIL_DETAIL_ERROR,
    };
  }

  const email = asRecord(record.email);
  if (!email || typeof email.id !== 'string') {
    return { ok: false, kind: 'error', error: GENERIC_EMAIL_DETAIL_ERROR };
  }

  return {
    ok: true,
    email: {
      id: email.id,
      bookingId: typeof email.bookingId === 'string' ? email.bookingId : null,
      type: typeof email.type === 'string' ? email.type : 'unknown',
      recipient: typeof email.recipient === 'string' ? email.recipient : '',
      subject: typeof email.subject === 'string' ? email.subject : '',
      status: typeof email.status === 'string' ? email.status : 'unknown',
      attemptCount: typeof email.attemptCount === 'number' ? email.attemptCount : 0,
      lastError: typeof email.lastError === 'string' ? email.lastError : null,
      createdAtIso: typeof email.createdAtIso === 'string' ? email.createdAtIso : null,
      updatedAtIso: typeof email.updatedAtIso === 'string' ? email.updatedAtIso : null,
      text: typeof email.text === 'string' && email.text ? email.text : null,
      attempts: parseAttempts(email.attempts),
    },
  };
}
