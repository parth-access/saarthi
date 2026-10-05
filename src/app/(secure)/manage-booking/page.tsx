"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import {
  Loader2,
  Calendar,
  Clock,
  Video,
  User,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { bookingService } from "@/services/bookingService";
import { DateStep } from "@/components/booking/steps/DateStep";
import { SlotStep } from "@/components/booking/steps/SlotStep";
import { Booking, BookingStatus } from "@/types";
import { istToUtcIsoString } from "@/shared/utils/dateTime";

interface EnrichedBooking extends Booking {
  therapistName: string;
}

interface ManageState {
  view: "dashboard" | "reschedule-date" | "reschedule-slot";
  newDate: string;
  newTime: string;
}

function ManageBookingPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [booking, setBooking] = React.useState<EnrichedBooking | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const [rescheduling, setRescheduling] = React.useState(false);
  const [state, setState] = React.useState<ManageState>({
    view: "dashboard",
    newDate: "",
    newTime: "",
  });

  React.useEffect(() => {
    let ignore = false;

    if (!token) {
      setLoadError("No booking token provided.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const data = await bookingService.getBookingByTokenAPIRoute(token);
        if (!ignore) {
          setBooking(data);
          setLoadError(null);
        }
      } catch (err) {
        if (!ignore) {
          setLoadError(
            (err instanceof Error ? err.message : String(err)) ||
              "Invalid or expired booking link."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      ignore = true;
    };
  }, [token]);

  const handleDateSelect = (date: string) => {
    setState((prev) => ({ ...prev, newDate: date, newTime: "" }));
  };

  const handleNextToSlots = () => {
    if (!state.newDate) return;
    setState((prev) => ({ ...prev, view: "reschedule-slot" }));
  };

  const handleSlotSelect = async (time: string) => {
    if (rescheduling) return;

    const targetDate = state.newDate;
    if (!targetDate) {
      setActionError("Please select a date before picking a time slot.");
      setState((prev) => ({ ...prev, view: "reschedule-date" }));
      return;
    }

    if (!token) {
      setActionError("Booking token is missing. Please reload the page.");
      return;
    }

    setRescheduling(true);
    setActionError(null);
    setState((prev) => ({ ...prev, newTime: time }));

    try {
      await bookingService.rescheduleByToken(token, targetDate, time);

      // Reload booking data
      const updated = await bookingService.getBookingByTokenAPIRoute(token);
      setBooking(updated);
      setState({ view: "dashboard", newDate: "", newTime: "" });

      toast.success("Session rescheduled successfully", {
        description: `Moved to ${format(
          parseISO(targetDate),
          "EEEE, MMMM do, yyyy"
        )} at ${formatTime12h(time)}.`,
      });
    } catch (err) {
      const errorMessage =
        (err instanceof Error ? err.message : String(err)) ||
        "Couldn't reschedule your session. Please try again.";
      setActionError(errorMessage);
      setState((prev) => ({ ...prev, view: "dashboard" }));
    } finally {
      setRescheduling(false);
    }
  };

  const formatTime12h = (time24: string) => {
    try {
      const [hours, minutes] = time24.split(":").map(Number);
      const period = hours >= 12 ? "PM" : "AM";
      const h12 = hours % 12 || 12;
      return `${h12}:${minutes.toString().padStart(2, "0")} ${period} IST`;
    } catch {
      return `${time24} IST`;
    }
  };

  // Domain Status & Time Evaluation
  const normStatus = (
    booking?.status
      ? booking.status.toLowerCase().replace(/[\s-]/g, "_")
      : "pending_approval"
  ) as BookingStatus;

  const isPast = React.useMemo(() => {
    if (!booking) return false;
    try {
      if (booking.utcDateTime) {
        return new Date(booking.utcDateTime).getTime() < Date.now();
      }
      if (booking.date && booking.time) {
        const utcIso = istToUtcIsoString(booking.date, booking.time);
        return new Date(utcIso).getTime() < Date.now();
      }
    } catch {
      return false;
    }
    return false;
  }, [booking]);

  const isCancelled = normStatus === "cancelled" || normStatus === "rejected";
  const isCompleted = normStatus === "completed";
  const canRescheduleStatus =
    normStatus === "confirmed" ||
    normStatus === "rescheduled" ||
    booking?.paymentStatus === "paid";

  const isReschedulable =
    canRescheduleStatus && !isPast && !isCancelled && !isCompleted;

  if (loading) {
    return (
      <div className="pt-32 pb-20 flex flex-col items-center justify-center min-h-[60vh] bg-[#FFFBE7]">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="font-serif italic text-primary/60">
          Verifying your booking...
        </p>
      </div>
    );
  }

  if (loadError || !booking) {
    return (
      <div className="pt-32 pb-20 px-4 min-h-[60vh] bg-[#FFFBE7] flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-lg border border-red-100">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-serif text-gray-900 mb-2">
            Unavailable
          </h2>
          <p className="text-gray-500 mb-8">
            {loadError || "We couldn't find a booking with this link."}
          </p>
          <Button
            asChild
            className="w-full rounded-full h-12"
            variant="outline"
          >
            <Link href="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-24 px-4 min-h-screen bg-[#FFFBE7]">
      <div className="max-w-3xl mx-auto">
        {state.view === "dashboard" && (
          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-primary/10">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-4 bg-primary/10 text-primary">
                {isCancelled && (
                  <span className="text-rose-600">Cancelled</span>
                )}
                {isCompleted && (
                  <span className="text-emerald-700">Completed</span>
                )}
                {isPast && !isCompleted && !isCancelled && (
                  <span className="text-gray-600">Past Session</span>
                )}
                {!isPast && !isCancelled && !isCompleted && (
                  <span className="text-emerald-700">Confirmed Session</span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-serif text-primary mb-3">
                Manage Your Session
              </h1>
              <p className="text-muted-foreground text-lg">
                Hi {booking.name}, here are your session details.
              </p>
            </div>

            {actionError && (
              <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-red-800 animate-in fade-in duration-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Reschedule Failed</p>
                    <p className="text-xs text-red-700 mt-0.5">{actionError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-red-400 hover:text-red-700 p-1 rounded-lg transition-colors"
                  aria-label="Dismiss error"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="bg-muted/10 rounded-3xl p-6 md:p-8 space-y-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">
                    Therapist
                  </p>
                  <p className="text-lg font-medium text-gray-900">
                    {booking.therapistName}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Video className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">
                    Mode
                  </p>
                  <p className="text-lg font-medium text-gray-900">
                    {booking.sessionMode || "Online Video"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">
                    Date
                  </p>
                  <p className="text-lg font-medium text-gray-900">
                    {booking.date
                      ? format(parseISO(booking.date), "EEEE, MMMM do, yyyy")
                      : "TBD"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-1">
                    Time
                  </p>
                  <p className="text-lg font-medium text-gray-900">
                    {booking.time ? formatTime12h(booking.time) : "TBD"}
                  </p>
                </div>
              </div>
            </div>

            {isReschedulable ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  className="flex-1 h-14 rounded-full text-base"
                  onClick={() => {
                    setActionError(null);
                    setState((prev) => ({ ...prev, view: "reschedule-date" }));
                  }}
                  disabled={rescheduling}
                >
                  Reschedule Session
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl p-4 bg-muted/20 text-center text-sm text-muted-foreground">
                {isCancelled &&
                  "This session has been cancelled and cannot be rescheduled."}
                {isCompleted &&
                  "This session has been completed."}
                {isPast && !isCompleted && !isCancelled &&
                  "This session has already taken place and cannot be rescheduled."}
                {!isCancelled && !isCompleted && !isPast && !canRescheduleStatus &&
                  "This booking status does not allow self-service rescheduling. Please contact support."}
              </div>
            )}
          </div>
        )}

        {state.view === "reschedule-date" && (
          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-primary/10">
            <DateStep
              selectedDate={state.newDate}
              onSelect={handleDateSelect}
              onNext={handleNextToSlots}
              onBack={() => {
                setActionError(null);
                setState((prev) => ({ ...prev, view: "dashboard" }));
              }}
            />
          </div>
        )}

        {state.view === "reschedule-slot" && (
          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-primary/10">
            <div className="mb-6 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-amber-900 text-sm flex items-center gap-2.5">
              <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Rescheduling to{" "}
                <strong>
                  {state.newDate
                    ? format(parseISO(state.newDate), "EEEE, MMMM do, yyyy")
                    : "Selected Date"}
                </strong>
                . Select a time slot below:
              </span>
            </div>

            <SlotStep
              therapistId={booking.therapistId}
              date={state.newDate}
              onSelect={handleSlotSelect}
              onBack={() =>
                setState((prev) => ({ ...prev, view: "reschedule-date" }))
              }
              lockingTime={rescheduling ? (state.newTime || "rescheduling") : null}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SafeManageBookingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="pt-32 pb-20 flex flex-col items-center justify-center min-h-[60vh] bg-[#FFFBE7] font-sans">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="font-serif italic text-primary/60">
            Loading session manager...
          </p>
        </div>
      }
    >
      <ManageBookingPage />
    </React.Suspense>
  );
}
