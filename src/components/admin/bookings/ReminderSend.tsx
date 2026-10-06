'use client';

/**
 * "Send reminder now" — the manual counterpart to the scheduled reminder job,
 * living on the booking it would remind about.
 *
 * The button is offered only where the server could actually accept it: a
 * confirmed, paid session with a Meet link. Everything else would be refused
 * with a skip reason, and a control whose normal outcome is refusal is how a
 * console trains operators to ignore its answers. The dialog states the
 * conditions and the idempotency before the send is offered, not after.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { ConfirmDialog } from '../ConfirmDialog';
import { toneClasses } from './adminBookingPresentation';
import { interpretReminderSendResponse } from './adminReminderResponse';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export interface ReminderFacts {
  readonly bookingId: string;
  /** True when the booking is confirmed — the only state the server accepts. */
  readonly confirmed: boolean;
  readonly reminderStatus: string | null;
  readonly hasMeetingLink: boolean;
  readonly clientName: string;
}

export type ReminderOutcome =
  | { readonly tone: AdminTone; readonly text: string }
  | null;

export function ReminderSend({ facts, onApplied }: { facts: ReminderFacts; onApplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<ReminderOutcome>(null);

  const eligible = facts.confirmed && facts.hasMeetingLink;
  if (!eligible) return null;

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const response = await fetchWithAuth('/api/admin/reminders/send', {
        method: 'POST',
        body: JSON.stringify({ bookingId: facts.bookingId }),
      });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const result = interpretReminderSendResponse(response.status, body);
      if (result.ok) {
        setOutcome({
          tone: result.alreadySent ? 'info' : 'success',
          text: result.alreadySent ? result.summary : `${result.summary} Reload to see it recorded.`,
        });
        setOpen(false);
        onApplied();
      } else {
        setOutcome({ tone: result.skipped ? 'info' : 'warning', text: result.error });
        setOpen(false);
        if (!result.skipped) onApplied();
      }
    } catch {
      setOutcome({
        tone: 'warning',
        text: 'The request did not complete, so it is not known whether the reminder went out. Reload before doing anything else.',
      });
      setOpen(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="col-span-2 border-t border-hairline pt-3">
      {outcome && (
        <p
          className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${toneClasses(outcome.tone)}`}
          role={outcome.tone === 'warning' ? 'alert' : 'status'}
        >
          {outcome.text}
        </p>
      )}
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Send reminder now
      </Button>
      {open && (
        <ConfirmDialog
          title="Send the session reminder"
          subtitle={facts.clientName ? `${facts.clientName}'s session reminder` : undefined}
          onClose={() => {
            if (!sending) setOpen(false);
          }}
          busy={sending}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={sending}>
                Don&apos;t send
              </Button>
              <Button size="sm" onClick={send} disabled={sending}>
                {sending ? 'Sending…' : 'Send reminder'}
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-xs leading-relaxed text-primary/80">
            <p>
              This emails the client (and the therapist, if the therapist has an email on file) the
              30-minute session reminder with the Meet link, now rather than at the scheduled
              moment.
            </p>
            <p>
              The server sends it only for confirmed, paid sessions, and only if this booking&apos;s
              reminder has not already gone out. A reminder that is not yet due or whose window has
              passed is declined with the reason stated — nothing is sent silently.
            </p>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
