'use client';

/**
 * Sending a schedule change and reading what came back.
 *
 * Thin on purpose: every decision that matters is either in
 * `interpretScheduleWriteResponse` (what the answer means) or in
 * `scheduleEditorForm` (whether the draft is storable). This hook owns the request
 * and the in-flight flag, and converts the two ways `fetchWithAuth` throws into the
 * same result shape the interpreter produces, so a caller never has to handle
 * exceptions and answers separately.
 *
 * Both thrown cases are reported as a **refusal**, not an unknown outcome, and that
 * is a claim worth stating: `fetchWithAuth` throws before sending when there is no
 * Firebase user, and a transport failure means the browser never received an
 * answer. Retrying either is safe here even in the worst case where the request did
 * reach Firestore — a repeated `delete_*` answers 404, a repeated `save_*` with an
 * id rewrites identical values, and a repeated *new* rule would overlap the one the
 * first attempt created and be refused. Nothing in this endpoint double-applies.
 */
import { useCallback, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  SCHEDULE_NETWORK_ERROR,
  SCHEDULE_SESSION_ERROR,
  interpretScheduleWriteResponse,
  type ScheduleWriteRequest,
  type ScheduleWriteResult,
} from './scheduleWriteResponse';

export interface ScheduleWriteState {
  readonly submitting: boolean;
  readonly send: (request: ScheduleWriteRequest) => Promise<ScheduleWriteResult>;
}

export function useAdminScheduleWrite(therapistId: string): ScheduleWriteState {
  const [submitting, setSubmitting] = useState(false);

  const send = useCallback(
    async (request: ScheduleWriteRequest): Promise<ScheduleWriteResult> => {
      setSubmitting(true);
      try {
        const response = await fetchWithAuth(
          `/api/admin/therapists/${encodeURIComponent(therapistId)}/schedule`,
          { method: 'POST', body: JSON.stringify(request) }
        );
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          // Left null. The interpreter reads an unreadable 2xx as unknown rather
          // than guessing at either outcome.
        }
        return interpretScheduleWriteResponse(response.status, body);
      } catch (err) {
        const noSession = err instanceof Error && err.message === 'User not authenticated';
        return { kind: 'refused', error: noSession ? SCHEDULE_SESSION_ERROR : SCHEDULE_NETWORK_ERROR };
      } finally {
        setSubmitting(false);
      }
    },
    [therapistId]
  );

  return { submitting, send };
}
