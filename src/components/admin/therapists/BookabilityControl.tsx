'use client';

/**
 * The bookability switch — the admin-only control for `therapists/{id}.active`,
 * wired to the dedicated endpoint this console owns.
 *
 * The dialog exists because the consequences are not symmetric and not obvious:
 * hiding a therapist refuses every NEW booking the moment it lands, while every
 * EXISTING booking stays exactly as manageable as before. An operator who
 * expected "pause everything" needs to read that distinction before committing,
 * not after.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { ConfirmDialog } from '../ConfirmDialog';
import { toneClasses } from '../bookings/adminBookingPresentation';
import { interpretBookabilityResponse } from './bookabilityResponse';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export interface BookabilityOutcome {
  readonly tone: AdminTone;
  readonly text: string;
}

export function BookabilityControl({
  therapistId,
  name,
  active,
  onApplied,
}: {
  therapistId: string;
  name: string;
  active: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<BookabilityOutcome | null>(null);

  async function commit() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth(
        `/api/admin/therapists/${encodeURIComponent(therapistId)}/bookability`,
        { method: 'POST', body: JSON.stringify({ active: !active }) }
      );
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const result = interpretBookabilityResponse(response.status, body);
      if (result.ok) {
        setOutcome({ tone: result.changed ? 'success' : 'info', text: result.summary });
        setOpen(false);
        onApplied();
      } else {
        setOutcome({ tone: 'warning', text: result.error });
        setOpen(false);
      }
    } catch {
      setOutcome({
        tone: 'warning',
        text: 'The request did not complete, so it is not known whether the change was written. Reload before doing anything else.',
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2.5 border-t border-hairline pt-2.5">
      {outcome && (
        <p
          className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${toneClasses(outcome.tone)}`}
          role={outcome.tone === 'warning' ? 'alert' : 'status'}
        >
          {outcome.text}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={active ? 'outline' : 'primary'}
          size="sm"
          onClick={() => setOpen(true)}
        >
          {active ? 'Mark not bookable' : 'Mark bookable'}
        </Button>
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          {active
            ? 'Changing it here hides this therapist from clients and refuses new bookings; existing bookings stay manageable.'
            : 'Changing it here re-lists this therapist for clients with the schedule as stored; nothing from before changes.'}
        </p>
      </div>

      {open && (
        <ConfirmDialog
          title={active ? `Mark ${name} not bookable?` : `Mark ${name} bookable?`}
          subtitle={active ? 'Clients will no longer be able to book this therapist.' : 'Clients will be able to book this therapist again.'}
          onClose={() => {
            if (!saving) setOpen(false);
          }}
          busy={saving}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                Don&apos;t change
              </Button>
              <Button size="sm" onClick={commit} disabled={saving}>
                {saving ? 'Writing…' : active ? 'Mark not bookable' : 'Mark bookable'}
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-xs leading-relaxed text-primary/80">
            {active ? (
              <>
                <p>
                  This hides {name} from the public booking page immediately, the availability
                  endpoint stops offering slots, and any booking attempt is refused — including one
                  already mid-flight in the wizard.
                </p>
                <p>
                  This does NOT touch {name}&apos;s existing bookings: they stay confirmed, stay on
                  the calendar, and remain fully manageable here. It also does not change the
                  schedule stored below.
                </p>
                <p>
                  The change is recorded in the audit log with your name on it, and can be undone
                  from this same panel.
                </p>
              </>
            ) : (
              <>
                <p>
                  This re-lists {name} on the public booking page with the schedule exactly as
                  stored below — no hours are added or changed by this switch.
                </p>
                <p>The change is recorded in the audit log with your name on it.</p>
              </>
            )}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
