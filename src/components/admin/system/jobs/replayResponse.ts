/**
 * Interpreting `POST /api/operations/replay` — shared by every screen that
 * offers a replay action.
 *
 * Same contract as the calendar retry: a refusal the server *sent* is known and
 * quoted; a transport failure leaves the outcome unknown (the replay may have
 * landed after the connection dropped), and an unknown outcome offers reload,
 * never retry.
 */
export type ReplayActionResult =
  | { readonly ok: true; readonly summary: string }
  | { readonly ok: false; readonly error: string; readonly indeterminate: boolean };

export const REPLAY_TRANSPORT_ERROR =
  'The request did not complete, so it is not known whether the replay happened. Reload this list before doing anything else.';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function interpretReplayActionResponse(status: number, body: unknown): ReplayActionResult {
  const record = asRecord(body);

  if (status === 200 && record && record.success === true) {
    return {
      ok: true,
      summary:
        typeof record.message === 'string' && record.message.length > 0
          ? record.message
          : 'The replay was accepted.',
    };
  }

  const serverError =
    record && typeof record.error === 'string' && record.error.length > 0 ? record.error : null;
  if (serverError) {
    return { ok: false, error: serverError, indeterminate: false };
  }

  return { ok: false, error: REPLAY_TRANSPORT_ERROR, indeterminate: true };
}
