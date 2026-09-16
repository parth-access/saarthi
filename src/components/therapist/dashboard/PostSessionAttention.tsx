'use client';

/**
 * Post-session attention section for the therapist dashboard.
 *
 * Surfaces completed sessions that need the therapist's follow-up: missing
 * session notes or no follow-up decision. Uses existing booking fields
 * (hasSessionNotes, followUpStatus) — no new queries.
 */
import Link from 'next/link';
import { AlertTriangle, FileText, StickyNote } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatTime12h } from '@/components/booking/bookingUi';
import type { Booking } from '@/types';

interface PostSessionAttentionProps {
  readonly sessions: readonly Booking[];
}

function attentionDetail(b: Booking): string {
  const missing: string[] = [];
  if (!b.hasSessionNotes) missing.push('notes');
  if (!b.followUpStatus) missing.push('follow-up decision');
  return missing.length > 0 ? `Needs ${missing.join(' & ')}` : 'Needs review';
}

export function PostSessionAttention({ sessions }: PostSessionAttentionProps) {
  if (sessions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-hairline pb-2.5">
        <div>
          <h2 className="font-serif text-base font-semibold text-primary">Needs attention</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sessions.length} completed session{sessions.length !== 1 ? 's' : ''} need post-session work.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {sessions.slice(0, 5).map((b) => {
          const dateLabel = b.date ? (() => {
            try { return format(parseISO(b.date), 'MMM d'); } catch { return b.date; }
          })() : '—';
          const time12 = formatTime12h(b.time);

          return (
            <div
              key={b.id}
              className="flex flex-col gap-2 rounded-xl border border-warning/20 bg-warning-surface/30 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">{b.name || 'Client'}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.status === 'completed' ? 'Completed' : 'No-show'} · {dateLabel} · {time12}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-warning">{attentionDetail(b)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:shrink-0">
                <Link
                  href={`/therapist/bookings/${b.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-primary/70 transition-colors hover:bg-primary/5 hover:text-primary"
                >
                  <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                  Add notes
                </Link>
                <Link
                  href={`/therapist/bookings/${b.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-primary/70 transition-colors hover:text-primary"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  View
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** All-clear empty state. */
export function PostSessionAllClear() {
  return (
    <section className="space-y-3">
      <div className="border-b border-hairline pb-2.5">
        <h2 className="font-serif text-base font-semibold text-primary">Post-session</h2>
      </div>
      <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-6 text-center shadow-sm">
        <p className="text-sm font-medium text-primary">You&apos;re all caught up.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          No sessions need attention right now.
        </p>
      </div>
    </section>
  );
}
