'use client';

/**
 * The clinical session card and the join button, as used by the therapist app
 * (the sessions page and the next-session hero).
 *
 * These two used to live inside the legacy admin dashboard component and were
 * extracted when that dashboard was removed — they are therapist-facing UI, not
 * admin console, and their behavior is unchanged: the join button asks the
 * server for the Meet room on first join, and the card shows the session as the
 * practice runs it.
 */
import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  Trash2,
  User,
  Video,
} from "lucide-react";
import { Booking, BookingStatus } from "../../types";
import { cn, toDateSafe } from "../../lib/utils";
import { isValidClientAge, parseAgeInput } from "@/shared/validation/age";
import { Button } from "@/components/ui/Button";
import { CopyableId } from "@/components/admin/bookings/CopyableId";
import { useJoinSession } from "@/hooks/useJoinSession";
import { TherapistPostSessionPanel } from "@/components/dashboard/TherapistPostSessionPanel";
import {
  statusBadge,
  paymentBadge,
  toneClasses,
} from "@/components/admin/bookings/adminBookingPresentation";

const formatAgeLabel = (age: unknown): string | null => {
  const parsed = parseAgeInput(age);
  if (parsed === null) return null;
  return isValidClientAge(parsed) ? `${parsed}y` : `${parsed}y (unverified)`;
};

/**
 * The single real "join" action, shared by the therapist workspace, the admin
 * console and the next-session hero. Uses the app's useJoinSession flow: opens
 * the stored meetingUrl instantly, or asks /api/bookings/join-session to create
 * the Google Meet room on demand (server verifies the caller is the assigned
 * therapist). Never fabricates a link.
 */
export function JoinSessionButton({ booking, className }: { booking: Booking; className?: string }) {
  const { join, joiningId } = useJoinSession();
  const isJoining = joiningId === booking.id;
  return (
    <button
      type="button"
      disabled={isJoining}
      onClick={() => join(booking)}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white transition-all duration-150",
        booking.meetingUrl
          ? "bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98]"
          : "bg-emerald-700/85 hover:bg-emerald-700 active:scale-[0.98] border border-dashed border-white/50",
        "disabled:cursor-wait disabled:opacity-80 motion-reduce:transition-colors motion-reduce:active:scale-100",
        className
      )}
    >
      {isJoining ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Preparing room…
        </>
      ) : (
        <>
          <Video className="h-3.5 w-3.5" aria-hidden="true" />
          {booking.meetingUrl ? "Join Google Meet" : "Join Session"}
        </>
      )}
    </button>
  );
}

interface ClinicalSessionCardProps {
  booking: Booking;
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  onDeclineRequest: (booking: Booking) => void;
  isProcessing: boolean;
  isTodaySession?: boolean;
}

export const ClinicalSessionCard: React.FC<ClinicalSessionCardProps> = ({
  booking,
  onUpdateStatus,
  onDeclineRequest,
  isProcessing,
  isTodaySession = false,
}) => {
  const formattedDate = booking.date
    ? format(parseISO(booking.date), "EEE, MMM d, yyyy")
    : "No Date";
  const ageLabel = formatAgeLabel(booking.age);

  const statusInfo = statusBadge(booking);
  const paymentInfo = booking.paymentStatus
    ? paymentBadge({ paymentStatus: booking.paymentStatus })
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 transition-all duration-150 shadow-xs relative overflow-hidden",
        isTodaySession ? "border-primary/30 ring-1 ring-primary/10" : "border-hairline hover:border-primary/20"
      )}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: Client and clinical detail */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Header row with Client Name, Status Badges, and Booking ID */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif font-semibold text-base text-primary">
                {booking.name}
              </h3>

              {/* Status Badge */}
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium border",
                  toneClasses(statusInfo.tone)
                )}
              >
                {statusInfo.label}
              </span>

              {/* Payment Badge (if distinct and present) */}
              {paymentInfo && (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[0.6875rem] font-medium border",
                    toneClasses(paymentInfo.tone)
                  )}
                >
                  {paymentInfo.label}
                </span>
              )}

              {/* Standard Saarthi Duration Badge */}
              <span className="px-2 py-0.5 rounded bg-neutral-surface text-primary/70 border border-hairline font-mono text-[0.6875rem]">
                45 mins
              </span>
            </div>

            {/* Copyable ID */}
            <div className="text-[0.6875rem] text-muted-foreground flex items-center gap-1 font-mono">
              <CopyableId id={booking.id} label="Booking ID" size="sm" />
            </div>
          </div>

          {/* Demographic & Contact Strip */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-primary/80">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              {[booking.gender || null, ageLabel].filter(Boolean).join(", ") || "Client Details"}
            </span>

            <span>•</span>
            <span className="px-2 py-0.5 rounded bg-neutral-surface font-medium text-primary/80 border border-hairline">
              {booking.sessionType || "Individual Therapy"}
            </span>

            {booking.phone && (
              <>
                <span>•</span>
                <a
                  href={`tel:${booking.phone}`}
                  className="flex items-center gap-1 font-mono text-primary/80 hover:text-primary transition-colors"
                >
                  <Phone className="h-3 w-3" />
                  {booking.phone}
                </a>
              </>
            )}

            {booking.email && (
              <>
                <span>•</span>
                <a
                  href={`mailto:${booking.email}`}
                  className="font-mono text-primary/80 hover:text-primary transition-colors truncate max-w-[200px]"
                >
                  {booking.email}
                </a>
              </>
            )}
          </div>

          {/* Clinical Intake Notes / Reason */}
          {booking.message ? (
            <div className="bg-neutral-surface/40 rounded-lg p-3 border border-hairline text-xs text-primary/80 italic relative">
              <span className="font-semibold text-primary/60 not-italic mr-1.5">Intake Note:</span>
              &ldquo;{booking.message}&rdquo;
            </div>
          ) : (
            <div className="text-[0.6875rem] text-muted-foreground italic">
              No specific intake note submitted for this session.
            </div>
          )}

          {/* Declined Notice (if rejected) */}
          {booking.status === "rejected" && booking.declineReason && (
            <div className="bg-danger-surface/60 rounded-lg p-3 border border-danger/20 text-xs text-danger">
              <div className="font-semibold">Declined: {booking.declineReason}</div>
              {booking.declineCustomNote && (
                <div className="mt-0.5 text-danger/80">{booking.declineCustomNote}</div>
              )}
              {Boolean(booking.declinedAt) && (
                <div className="text-[0.625rem] text-danger/60 mt-1 tabular">
                  {format(toDateSafe(booking.declinedAt) || new Date(), "MMM d, yyyy h:mm a")}
                </div>
              )}
            </div>
          )}

          {/* 30m Reminder Indicator (Confirmed sessions) */}
          {booking.status === "confirmed" && (
            <div className="flex items-center gap-2 pt-1 text-[0.6875rem]">
              {booking.reminderStatus === "SENT" ? (
                <span className="inline-flex items-center gap-1 text-success font-medium">
                  <CheckCircle2 className="h-3 w-3" /> 30m Reminder Sent
                </span>
              ) : booking.reminderStatus === "FAILED" ? (
                <span className="inline-flex items-center gap-1 text-danger font-medium">
                  <AlertCircle className="h-3 w-3" /> Reminder Issue: {booking.reminderError || "Failed"}
                </span>
              ) : booking.reminderStatus === "SKIPPED" ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" /> 30m Reminder Skipped
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-info font-medium">
                  <Bell className="h-3 w-3" /> 30m Reminder Scheduled
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Date/Time Badge & Action Column */}
        <div className="md:w-56 shrink-0 flex flex-col md:items-end justify-between gap-4 border-t md:border-t-0 md:border-l border-hairline pt-3 md:pt-0 md:pl-4">
          <div className="text-left md:text-right w-full">
            <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-0.5">
              Appointment Slot
            </div>
            <div className="text-xs font-medium text-primary">{formattedDate}</div>
            <div className="text-lg font-mono font-semibold text-primary mt-0.5">
              {booking.time} <span className="text-xs font-normal text-muted-foreground">IST</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 w-full">
            {/* Pending Requests: Send Payment Link or Decline */}
            {(booking.status === "pending" || booking.status === "pending_approval") && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, "awaiting_payment")}
                  className="w-full justify-center gap-1.5 text-xs"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Send Payment Link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => onDeclineRequest(booking)}
                  className="w-full justify-center text-xs text-muted-foreground hover:text-danger hover:bg-danger-surface transition-colors"
                >
                  Decline Session
                </Button>
              </>
            )}

            {/* Confirmed Sessions: Join Meet, Complete, Cancel */}
            {booking.status === "confirmed" && (
              <>
                <JoinSessionButton booking={booking} className="w-full h-8" />
                {!booking.meetingUrl && (
                  <p className="text-center text-[0.625rem] leading-snug text-muted-foreground">
                    Your Meet room is created the first time you join (or when the calendar retry runs).
                  </p>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, "completed")}
                  className="w-full justify-center gap-1.5 text-xs text-success border-success/30 hover:bg-success-surface"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Mark Completed
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, "cancelled")}
                  className="w-full justify-center gap-1 text-xs text-muted-foreground hover:text-danger hover:bg-danger-surface"
                >
                  <Trash2 className="h-3 w-3" />
                  Cancel
                </Button>
              </>
            )}

            {/* Awaiting Payment Sessions: Complete or Cancel */}
            {booking.status === "awaiting_payment" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, "completed")}
                  className="w-full justify-center gap-1.5 text-xs text-success border-success/30 hover:bg-success-surface"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Mark Completed
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, "cancelled")}
                  className="w-full justify-center gap-1 text-xs text-muted-foreground hover:text-danger hover:bg-danger-surface"
                >
                  <Trash2 className="h-3 w-3" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Post-session actions for concluded sessions */}
      {(booking.status === "completed" || booking.status === "no_show") && (
        <TherapistPostSessionPanel booking={booking} />
      )}
    </div>
  );
};
