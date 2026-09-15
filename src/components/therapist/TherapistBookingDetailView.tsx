'use client';

/**
 * The therapist's single-booking view, data-presentational half.
 *
 * Split from `TherapistBookingDetailScreen` (which owns the fetch) so the
 * rendered states — confirmed, cancelled, completed, no-show, missing meet
 * link — can be tested directly from fixtures without a DOM. The parent screen
 * hands it a fully loaded `Booking` and a reload callback; everything shown
 * here derives from that object alone.
 *
 * Privacy invariants (see the screen for the fetch side):
 *  - private notes appear only via the existing post-session panel;
 *  - the client summary surfaces only through the shared-summary flag;
 *  - no manage-booking token is rendered anywhere.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Star, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CopyableId } from '@/components/admin/bookings/CopyableId';
import { TherapistPostSessionPanel } from '@/components/dashboard/TherapistPostSessionPanel';
import { useJoinSession } from '@/hooks/useJoinSession';
import { useTherapists } from '@/hooks/useTherapists';
import {
  formatSessionDate,
  formatSessionTimeRange,
  SESSION_DURATION_LABEL,
} from '@/lib/sessionDisplay';
import { formatTimestamp, statusBadgeFor } from './bookingDetailPresentation';
import type { Booking } from '@/types';

export function TherapistBookingDetailView({
  booking,
  onAfterSave,
}: {
  booking: Booking;
  /** Called after a post-session save so the screen can re-read the booking. */
  onAfterSave?: () => void;
}) {
  const { join, joiningId } = useJoinSession();
  const { therapists } = useTherapists();

  const therapistName = React.useMemo(() => {
    const byId = new Map(therapists.map((t) => [t.id, t.name]));
    return (id: string) => byId.get(id) ?? 'Assigned therapist';
  }, [therapists]);

  const isConfirmed = booking.status === 'confirmed';
  const isUpcoming =
    isConfirmed || booking.status === 'pending' || booking.status === 'pending_approval';
  const isCancelled =
    booking.status === 'cancelled' || booking.status === 'rejected' || booking.status === 'expired';

  const hasPostSession =
    booking.status === 'completed' ||
    booking.status === 'no_show' ||
    booking.hasSessionNotes === true ||
    (booking.followUpStatus ?? '') !== '' ||
    booking.clientSummaryShared === true;

  return (
    <div className="space-y-3">
      <BackLink />

      <header className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {formatSessionDate(booking.date)} · {formatSessionTimeRange(booking.time)} (
              {SESSION_DURATION_LABEL})
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-primary">
              {booking.name || 'Name not recorded'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {booking.sessionType || 'Therapy session'} · with {therapistName(booking.therapistId)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <StatusBadge status={booking.status} />
            <CopyableId id={booking.id} size="md" />
          </div>
        </div>
      </header>

      {/* Primary action above the record, mirroring the console's placement. */}
      <div className="flex flex-wrap items-center gap-2">
        {isConfirmed && (
          <Button onClick={() => join(booking)} disabled={joiningId === booking.id} className="gap-2">
            <Video aria-hidden="true" className="h-4 w-4" />
            {joiningId === booking.id ? 'Preparing…' : 'Join meeting'}
          </Button>
        )}
        {isUpcoming && !booking.meetingUrl && (
          <p className="text-xs text-muted-foreground">
            The meeting room is created when the session is confirmed; use Join meeting at session
            time.
          </p>
        )}
        {booking.meetingUrl && (
          <a
            href={booking.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2 hover:text-accent"
          >
            Open the Meet link
            <Video aria-hidden="true" className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Session">
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Date" value={formatSessionDate(booking.date)} />
            <Field label="Time" value={formatSessionTimeRange(booking.time)} />
            <Field label="Duration" value={SESSION_DURATION_LABEL} />
            <Field label="Type" value={booking.sessionType} />
            <Field
              label="Mode"
              value={booking.sessionMode ? booking.sessionMode.replace(/_/g, ' ') : null}
            />
          </dl>
        </Card>

        <Card title="Client">
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Name" value={booking.name} />
            <Field label="Email">
              {booking.email ? (
                <a href={`mailto:${booking.email}`} className="break-all underline underline-offset-2">
                  {booking.email}
                </a>
              ) : null}
            </Field>
            <Field label="Phone">
              {booking.phone ? (
                <a href={`tel:${booking.phone}`} className="tabular underline underline-offset-2">
                  {booking.phone}
                </a>
              ) : null}
            </Field>
          </dl>
        </Card>

        <Card
          title="Post-session"
          subtitle="Private to you — the client never sees your private notes."
        >
          {hasPostSession ? (
            <TherapistPostSessionPanel booking={booking} onSaved={onAfterSave} />
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Post-session actions appear here once the session is completed.
            </p>
          )}
        </Card>

        <Card title="Reminder" subtitle="What the client's reminder email has done so far.">
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Field
              label="Reminder status"
              value={booking.reminderStatus ? booking.reminderStatus.toLowerCase() : null}
            />
            <Field label="Reminder sent" value={formatTimestamp(booking.reminderSentAt)} />
          </dl>
        </Card>

        <Card title="Booking" subtitle="Record metadata.">
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="Booking id" value={booking.id} mono />
            <Field label="Created" value={formatTimestamp(booking.createdAt)} />
            <Field label="Last updated" value={formatTimestamp(booking.updatedAt)} />
          </dl>
        </Card>
      </div>

      {isCancelled && (
        <Card title="Why this booking ended">
          <Field
            label="Reason"
            value={booking.cancellationOrRejectionReason ?? booking.declineReason}
            wide
          />
        </Card>
      )}

      {booking.reviewRating != null && (
        <Card title="Client feedback" subtitle="The rating the client chose to leave after the session.">
          <div className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-4 w-4 ${n <= booking.reviewRating! ? 'fill-amber-400 text-amber-400' : 'text-primary/20'}`}
                aria-hidden="true"
              />
            ))}
            <span className="ml-1 text-sm font-medium text-primary">{booking.reviewRating} / 5</span>
          </div>
          {booking.reviewComment && (
            <p className="mt-2 text-xs italic text-primary/70">“{booking.reviewComment}”</p>
          )}
          <span className="sr-only">{`Client rated this session ${booking.reviewRating} out of 5`}</span>
        </Card>
      )}

      {booking.reviewComment && booking.reviewRating == null && (
        <Card title="Client feedback">
          <p className="mt-2 text-xs italic text-primary/70">“{booking.reviewComment}”</p>
        </Card>
      )}

      {booking.previousBookingId && (
        <p className="text-xs text-muted-foreground">
          Follow-up of{' '}
          <Link
            href={`/therapist/bookings/${booking.previousBookingId}`}
            className="underline underline-offset-2 hover:text-primary"
          >
            {booking.previousBookingId}
          </Link>
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const badge = statusBadgeFor(status);
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function Field({
  label,
  value,
  children,
  mono,
  wide,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
  mono?: boolean;
  wide?: boolean;
}) {
  const empty = value === null || value === undefined || value.length === 0;
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm text-primary/80 ${mono ? 'font-mono' : ''}`}>
        {children ?? (empty ? <span className="text-muted-foreground">—</span> : value)}
      </dd>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/therapist"
      className="inline-flex items-center gap-1.5 text-xs text-primary/70 underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      Your dashboard
    </Link>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading this booking…</p>
      <div className="h-24 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl bg-neutral-surface" />
        ))}
      </div>
    </div>
  );
}

export function LoadFailed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-medium text-primary">This booking could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing about the booking is shown — a partly loaded
        booking is worse than none.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

export function NotFoundCard() {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-medium text-primary">Booking not found</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        We couldn&apos;t find this booking — it may not exist, or it may not be assigned to you.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link href="/therapist">Back to your dashboard</Link>
      </Button>
    </div>
  );
}
