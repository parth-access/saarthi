'use client';

/**
 * Reading the action endpoint's answer.
 *
 * A separate module because the browser must not guess. The endpoint reports what
 * *happened*, and three of its answers look alike at a glance and mean different
 * things:
 *
 *  - `200 { success: true, changed: true }` — the operation was applied.
 *  - `200 { success: true, changed: false }` — the handler's idempotent path ran
 *    and nothing was written. An operator told "Booking cancelled" here would go
 *    on to tell a client that the platform had just done something it did last
 *    Tuesday.
 *  - any non-2xx — nothing was written, and `error` is already operator-facing
 *    copy chosen by `classifyActionError`. It is shown as written; there is no
 *    second layer of interpretation, because the server already decided what is
 *    safe to say.
 *
 * A malformed 2xx body is treated as an *unknown* outcome rather than as a
 * success or a failure, because the write may well have happened. That wording
 * matters: it sends an operator to reload rather than to retry, and a retry is
 * the one thing that could double-apply.
 */

export const ACTION_SESSION_ERROR =
  'Your admin session is no longer valid. Sign in again, then reload this booking.';

export const ACTION_NETWORK_ERROR =
  'The request did not reach the server, so nothing was changed. Check your connection and try again.';

export const ACTION_UNKNOWN_OUTCOME =
  'The server answered in a form this console could not read, so it is not known whether the operation was applied. Reload this booking to see its current state — do not retry until you have.';

export type AdminActionResult =
  | {
      readonly ok: true;
      /** False on an idempotent no-op. Drives neutral rather than success styling. */
      readonly changed: boolean;
      readonly summary: string;
      readonly details: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: string;
      /**
       * True when it is not known whether the write landed. The UI must not offer a
       * retry, and must reload.
       */
      readonly indeterminate: boolean;
    };

function stringsIn(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function interpretAdminActionResponse(status: number, body: unknown): AdminActionResult {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const serverError = typeof record?.error === 'string' && record.error.length > 0 ? record.error : null;

  if (status === 401 || status === 403) {
    // 403 is also what `requireAdmin` answers for a signed-in non-admin, so the
    // server's own sentence is preferred when it sent one.
    return { ok: false, error: serverError ?? ACTION_SESSION_ERROR, indeterminate: false };
  }

  if (status < 200 || status >= 300) {
    // Already vetted copy: 409 conflicts, 400 validation, the generic 500. The one
    // thing not to do here is substitute a friendlier sentence and lose the reason.
    return {
      ok: false,
      error: serverError ?? ACTION_UNKNOWN_OUTCOME,
      // A 5xx without a recognisable body could have committed before failing.
      indeterminate: serverError === null,
    };
  }

  if (!record || record.success !== true || typeof record.summary !== 'string') {
    return { ok: false, error: ACTION_UNKNOWN_OUTCOME, indeterminate: true };
  }

  return {
    ok: true,
    // Absent `changed` is read as false: the safer of the two, since it produces a
    // neutral report and an operator who reloads rather than one who is congratulated.
    changed: record.changed === true,
    summary: record.summary,
    details: stringsIn(record.details),
  };
}
