'use client';

/**
 * Archive (remove) / restore a therapist. Archiving is the "remove" action:
 * records are never deleted because bookings, receipts and notes point at them.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { ConfirmDialog } from '../ConfirmDialog';
import { toneClasses } from '../bookings/adminBookingPresentation';

export function ArchiveControl({
  therapistId,
  name,
  archived,
  onApplied,
}: {
  therapistId: string;
  name: string;
  archived: boolean;
  onApplied: (summary: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/admin/therapists/${encodeURIComponent(therapistId)}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived: !archived }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || 'The change could not be saved.');
      setOpen(false);
      onApplied(body.summary as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2.5 border-t border-hairline pt-2.5">
      {error && !open && (
        <p role="alert" className={`mb-2 rounded-lg px-2.5 py-1.5 text-xs ${toneClasses('warning')}`}>{error}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
          className={archived ? '' : 'text-danger border-danger/30 hover:bg-danger-surface'}
        >
          {archived ? 'Restore therapist' : 'Remove (archive) therapist'}
        </Button>
        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          {archived
            ? 'Brings them back to the roster. They stay not bookable until you switch that on.'
            : 'For someone leaving the practice. Their history is kept; nothing is deleted.'}
        </p>
      </div>

      {open && (
        <ConfirmDialog
          title={archived ? `Restore ${name}?` : `Remove ${name} from the practice?`}
          subtitle={archived ? 'They return to the roster, not yet bookable.' : 'They are archived, not deleted.'}
          onClose={() => {
            if (!saving) setOpen(false);
          }}
          busy={saving}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
                Don&apos;t change
              </Button>
              <Button
                size="sm"
                onClick={commit}
                disabled={saving}
                className={archived ? '' : 'bg-danger text-white hover:bg-danger/90'}
              >
                {saving ? 'Saving…' : archived ? 'Restore' : 'Archive therapist'}
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-xs leading-relaxed text-primary/80">
            {error && <p role="alert" className={`rounded-lg px-2.5 py-1.5 ${toneClasses('warning')}`}>{error}</p>}
            {archived ? (
              <p>{name} will appear in the roster again. Check their schedule, then mark them bookable when ready.</p>
            ) : (
              <>
                <p>
                  {name} is hidden from the public site and the roster, and can never be booked. Past sessions,
                  receipts, refunds and notes are all kept and stay viewable.
                </p>
                <p>
                  This is refused while they still have upcoming sessions — cancel or move those first. If you
                  only need a break, use “Mark not bookable” instead.
                </p>
                <p>The change is recorded in the audit log and can be undone from this panel.</p>
              </>
            )}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
