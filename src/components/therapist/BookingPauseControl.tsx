'use client';

/**
 * Lets a therapist pause / resume NEW bookings for themselves (leave, a busy
 * week). Existing sessions are unaffected. Backed by /api/therapist/bookability.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

export function BookingPauseControl({
  active,
  archived,
  onChanged,
}: {
  active: boolean;
  archived: boolean;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  async function setActive(next: boolean) {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/therapist/bookability', {
        method: 'POST',
        body: JSON.stringify({ active: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || 'The change could not be saved.');
      toast.success(next ? 'You are accepting new bookings again.' : 'New bookings paused.');
      setConfirming(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The change could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (archived) {
    return (
      <div className="rounded-xl border border-hairline bg-neutral-surface px-4 py-3 text-xs text-primary/80">
        Your profile has been archived by the practice, so you can&apos;t receive new bookings. Contact an
        administrator if this is a mistake.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        active ? 'border-success/30 bg-success-surface' : 'border-warning/30 bg-warning-surface'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">
          {active ? 'Accepting new bookings' : 'New bookings paused'}
        </p>
        <p className="text-xs text-muted-foreground">
          {active
            ? 'Clients can see you and request sessions in your working hours.'
            : "You're hidden from the booking page. Your existing sessions are unchanged."}
        </p>
      </div>
      <Button
        size="sm"
        variant={active ? 'outline' : 'primary'}
        disabled={saving}
        onClick={() => (active ? setConfirming(true) : void setActive(true))}
      >
        {saving ? 'Saving…' : active ? 'Pause new bookings' : 'Resume bookings'}
      </Button>

      <Modal isOpen={confirming} onClose={() => !saving && setConfirming(false)} title="Pause new bookings?">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            You&apos;ll be hidden from the booking page and no new requests can be made. Sessions already
            booked stay as they are — cancel or reschedule those separately if you&apos;re away. You can
            resume any time.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>
              Keep accepting
            </Button>
            <Button onClick={() => void setActive(false)} disabled={saving}>
              Pause bookings
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
