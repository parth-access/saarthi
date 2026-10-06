'use client';

/**
 * One email's full record — dispatch history and plaintext backup — loaded when
 * a row is expanded. The expanded id is the hook's identity; collapsing to null
 * drops the request.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import {
  createLatestRequestGuard,
  interpretAdminEmailDetailResponse,
} from './adminEmailDetailResponse';
import type { EmailLogDetail } from '@/domains/admin/emailTriage';

export type AdminEmailDetailState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'not-found'; readonly error: string }
  | { readonly kind: 'error'; readonly error: string }
  | { readonly kind: 'loaded'; readonly email: EmailLogDetail };

export function useAdminEmailDetail(emailId: string | null): AdminEmailDetailState {
  const [state, setState] = useState<AdminEmailDetailState>({ kind: 'idle' });
  const guard = useRef(createLatestRequestGuard());

  useEffect(() => {
    if (!emailId) {
      setState({ kind: 'idle' });
      return;
    }

    const ticket = guard.current.begin();
    setState({ kind: 'loading' });

    (async () => {
      try {
        const response = await fetchWithAuth(
          `/api/admin/emails/${encodeURIComponent(emailId)}`
        );
        if (!guard.current.isCurrent(ticket)) return;
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (!guard.current.isCurrent(ticket)) return;
        const result = interpretAdminEmailDetailResponse(response.status, body);
        if (result.ok) setState({ kind: 'loaded', email: result.email });
        else if (result.kind === 'not-found') setState({ kind: 'not-found', error: result.error });
        else setState({ kind: 'error', error: result.error });
      } catch {
        if (!guard.current.isCurrent(ticket)) return;
        setState({ kind: 'error', error: 'The read did not complete. Try again.' });
      }
    })();
  }, [emailId]);

  return state;
}
