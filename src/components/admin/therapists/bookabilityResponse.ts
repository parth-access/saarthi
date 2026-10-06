/**
 * Interpreting `POST /api/admin/therapists/[therapistId]/bookability`. Pure and
 * React-free. A no-op (the flag was already in the requested state) is its own
 * honest outcome — the server wrote nothing and says so.
 */

export type BookabilityResult =
  | { readonly ok: true; readonly changed: boolean; readonly summary: string }
  | { readonly ok: false; readonly error: string; readonly indeterminate: boolean };

export const BOOKABILITY_TRANSPORT_ERROR =
  'The request did not complete, so it is not known whether the change was written. Reload this therapist before doing anything else.';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function interpretBookabilityResponse(status: number, body: unknown): BookabilityResult {
  const record = asRecord(body);

  if (status === 200 && record && record.success === true) {
    return {
      ok: true,
      changed: record.changed === true,
      summary:
        typeof record.summary === 'string' && record.summary
          ? record.summary
          : 'The bookability state was written.',
    };
  }

  const serverError =
    record && typeof record.error === 'string' && record.error.length > 0 ? record.error : null;
  if (serverError) {
    return { ok: false, error: serverError, indeterminate: false };
  }

  return { ok: false, error: BOOKABILITY_TRANSPORT_ERROR, indeterminate: true };
}
