/**
 * Interpreting `POST /api/admin/calendar/retry` for the screen.
 *
 * The distinction that drives the UI: a failure the server *reports* (no such
 * booking, wrong state, the retry did not succeed) is known and shows the
 * server's sentence; a failure of *transport* — the request never completed —
 * leaves the outcome unknown, because the retry may have landed after the
 * connection dropped. An unknown outcome offers reload, never retry, which is
 * the same rule the booking actions follow.
 */
export type CalendarRetryResult =
  | {
      readonly ok: true;
      readonly outcome: 'created' | 'already_exists';
      readonly summary: string;
      readonly meetingUrl: string | null;
    }
  | { readonly ok: false; readonly error: string; readonly indeterminate: boolean };

export const RETRY_TRANSPORT_ERROR =
  'The request did not complete, so it is not known whether the retry happened. Reload this list before doing anything else.';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function interpretCalendarRetryResponse(
  status: number,
  body: unknown
): CalendarRetryResult {
  const record = asRecord(body);

  if (status === 200 && record && record.success === true) {
    const outcome = record.outcome === 'already_exists' ? 'already_exists' : 'created';
    const summary =
      typeof record.message === 'string' && record.message.length > 0
        ? record.message
        : outcome === 'already_exists'
          ? 'A calendar event and Meet link already exist for this session.'
          : 'Google Calendar event & Meet conference successfully created.';
    return {
      ok: true,
      outcome,
      summary,
      meetingUrl: typeof record.meetingUrl === 'string' && record.meetingUrl ? record.meetingUrl : null,
    };
  }

  const serverError =
    record && typeof record.error === 'string' && record.error.length > 0 ? record.error : null;

  if (serverError) {
    // 429/404/409/500 with a server sentence: the server saw the request and
    // refused or failed it — a known outcome.
    return { ok: false, error: serverError, indeterminate: false };
  }

  return { ok: false, error: RETRY_TRANSPORT_ERROR, indeterminate: true };
}
