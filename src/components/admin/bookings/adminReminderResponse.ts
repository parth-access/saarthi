/**
 * Interpreting `POST /api/admin/reminders/send` for the booking detail screen.
 *
 * The reminder endpoint has three kinds of answer and the UI must not blur
 * them: a send (the email went out), a skip (the server declined for a stated
 * reason — not yet due, window passed, wrong state — which is a *known outcome*,
 * not an error), and a failure (the send was attempted and did not go through).
 * A transport failure is indeterminate: reload, never retry.
 */

export type ReminderSendResult =
  | { readonly ok: true; readonly alreadySent: boolean; readonly summary: string }
  | { readonly ok: false; readonly skipped: boolean; readonly error: string; readonly indeterminate: boolean };

export const REMINDER_TRANSPORT_ERROR =
  'The request did not complete, so it is not known whether the reminder went out. Reload this booking before doing anything else.';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function interpretReminderSendResponse(status: number, body: unknown): ReminderSendResult {
  const record = asRecord(body);

  if (status === 200 && record && record.success === true) {
    return {
      ok: true,
      alreadySent: record.alreadySent === true,
      summary:
        typeof record.message === 'string' && record.message
          ? record.message
          : 'Session reminder email dispatched successfully.',
    };
  }

  const serverError =
    record && typeof record.error === 'string' && record.error ? record.error : null;

  if (status === 200 && record && record.success === false) {
    // The skip: the server saw it, declined, and said why.
    return {
      ok: false,
      skipped: true,
      error: serverError ?? 'The reminder was not sent.',
      indeterminate: false,
    };
  }

  if (serverError) {
    return { ok: false, skipped: false, error: serverError, indeterminate: false };
  }

  return { ok: false, skipped: false, error: REMINDER_TRANSPORT_ERROR, indeterminate: true };
}
