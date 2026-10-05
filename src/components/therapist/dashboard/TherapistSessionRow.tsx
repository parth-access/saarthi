'use client';

/**
 * Compact, clickable session row for the therapist dashboard lists.
 *
 * This is NOT the full ClinicalSessionCard. It shows time, client name, type,
 * and status, and clicking navigates to the booking detail page. The dashboard
 * is the overview; the detail page is where the therapist operates.
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { statusBadge, toneClasses } from '@/components/admin/bookings/adminBookingPresentation';
import { formatTime12h } from '@/components/booking/bookingUi';
import type { Booking } from '@/types';

interface TherapistSessionRowProps {
  readonly booking: Booking;
  /** Whether this session is happening today — renders with a subtle emphasis. */
  readonly isToday?: boolean;
}

export function TherapistSessionRow({ booking, isToday: today }: TherapistSessionRowProps) {
  const badge = statusBadge(booking);
  const time12 = formatTime12h(booking.time);

  return (
    <Link
      href={`/therapist/bookings/${booking.id}`}
      className={cn(
        'group flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition-all duration-150',
        'hover:border-primary/20 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        today ? 'border-primary/15' : 'border-hairline'
      )}
    >
      {/* Time column */}
      <div className="w-20 shrink-0 text-right">
        <span className="font-mono text-sm font-semibold tabular-nums text-primary">{time12}</span>
      </div>

      {/* Divider dot */}
      <div className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        booking.status === 'confirmed' ? 'bg-success' :
        booking.status === 'completed' ? 'bg-primary/30' :
        booking.status === 'pending' || booking.status === 'pending_approval' ? 'bg-warning' :
        booking.status === 'cancelled' || booking.status === 'rejected' ? 'bg-danger/50' :
        'bg-info'
      )} />

      {/* Client info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-primary">{booking.name || 'Client'}</p>
        <p className="truncate text-xs text-muted-foreground">
          {booking.sessionType || 'Individual'} · 45 min
        </p>
      </div>

      {/* Status badge */}
      <span
        className={cn(
          'hidden shrink-0 rounded px-2 py-0.5 text-[0.6875rem] font-medium sm:inline-block',
          toneClasses(badge.tone)
        )}
        title={badge.title}
      >
        {badge.label}
      </span>

      {/* Chevron */}
      <ChevronRight
        className="h-4 w-4 shrink-0 text-primary/25 transition-all group-hover:text-primary/60 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
