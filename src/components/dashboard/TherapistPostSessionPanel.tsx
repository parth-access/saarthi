'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Check, StickyNote, CalendarPlus, Users } from 'lucide-react';
import { auth } from '@/lib/firebase/client';
import { Booking } from '@/types';

/**
 * Therapist post-session actions for a completed session:
 * private notes, client-facing summary (explicit opt-in share), and the
 * follow-up decision. Talks only to the server-authorized APIs — the browser
 * can never write privateNotes/followUpStatus directly, and private notes are
 * fetched only through the therapist-only endpoint.
 */

interface TherapistPostSessionPanelProps {
  booking: Booking;
  onSaved?: () => void;
}

type FollowUpStatus = 'recommended' | 'scheduled' | 'deferred' | 'none';

const FOLLOW_UP_OPTIONS: { value: FollowUpStatus; label: string }[] = [
  { value: 'recommended', label: 'Follow-up recommended' },
  { value: 'scheduled', label: 'Follow-up scheduled' },
  { value: 'deferred', label: "I'll schedule later" },
  { value: 'none', label: 'No follow-up needed' },
];

export const TherapistPostSessionPanel: React.FC<TherapistPostSessionPanelProps> = ({ booking, onSaved }) => {
  const [open, setOpen] = useState(false);

  const [privateNotes, setPrivateNotes] = useState('');
  const [clientSummary, setClientSummary] = useState('');
  const [, setShared] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [followUp, setFollowUp] = useState<FollowUpStatus | ''>(booking.followUpStatus || '');
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  useEffect(() => {
    if (!open || notesLoaded) return;
    let active = true;
    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user) throw new Error('Not signed in');
        const token = await user.getIdToken();
        const res = await fetch(`/api/bookings/session-notes?bookingId=${booking.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.success && data.notes) {
          setPrivateNotes(data.notes.privateNotes || '');
          setClientSummary(data.notes.clientSummary || '');
          setShared(!!data.notes.clientSummaryShared);
        }
        setNotesLoaded(true);
      } catch {
        if (active) setNotesLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, notesLoaded, booking.id]);

  const saveNotes = async (share: boolean) => {
    setSavingNotes(true);
    setNotesMessage(null);
    setNotesError(null);
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error('Please sign in');
      const token = await user.getIdToken();
      const res = await fetch('/api/bookings/session-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId: booking.id,
          privateNotes,
          clientSummary,
          shareSummaryWithClient: share,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save notes');
      }
      setShared(share);
      setNotesMessage(share ? 'Notes saved. Summary shared with the client.' : 'Notes saved privately.');
      onSaved?.();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const saveFollowUp = async (status: FollowUpStatus) => {
    setSavingFollowUp(true);
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error('Please sign in');
      const token = await user.getIdToken();
      const res = await fetch('/api/bookings/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id, followUpStatus: status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save follow-up decision');
      }
      setFollowUp(status);
      onSaved?.();
    } catch {
      /* keep previous state; the therapist can retry */
    } finally {
      setSavingFollowUp(false);
    }
  };

  return (
    <div className="border-t border-hairline pt-3 mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary/70 hover:text-primary transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <StickyNote className="h-3.5 w-3.5" />
        Post-session actions
        {booking.clientSummaryShared && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-[0.625rem] text-success font-medium bg-success-surface px-1.5 py-0.5 rounded border border-success/30">
            <Check className="h-3 w-3" /> Summary shared
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {/* Private notes + client summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">
                Private notes (never shared)
              </label>
              <textarea
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-hairline bg-background p-2.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="Your private session notes…"
              />
            </div>
            <div>
              <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1">
                Summary for client (only if you share it)
              </label>
              <textarea
                value={clientSummary}
                onChange={(e) => setClientSummary(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-hairline bg-background p-2.5 text-xs text-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                placeholder="What you discussed, takeaways, things to consider…"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingNotes}
              onClick={() => saveNotes(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Save notes
            </button>
            <button
              type="button"
              disabled={savingNotes || !clientSummary.trim()}
              onClick={() => saveNotes(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {savingNotes ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
              Save &amp; share summary with client
            </button>
            {notesMessage && <span className="text-xs text-success font-medium">{notesMessage}</span>}
            {notesError && <span className="text-xs text-danger font-medium">{notesError}</span>}
          </div>

          {/* Follow-up decision */}
          <div>
            <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-1.5">
              Follow-up decision
            </label>
            <div className="flex flex-wrap gap-2">
              {FOLLOW_UP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingFollowUp}
                  onClick={() => saveFollowUp(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer disabled:opacity-60 ${
                    followUp === opt.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-primary/70 border-hairline hover:border-primary/30 hover:text-primary'
                  }`}
                >
                  {followUp === opt.value && <Check className="h-3 w-3" />}
                  {opt.label}
                </button>
              ))}
            </div>
            {followUp === 'recommended' && (
              <a
                href="/therapist/book?followUp=1"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-accent transition-colors"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> Schedule the follow-up now
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
