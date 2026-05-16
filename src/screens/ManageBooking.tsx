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
  ChevronLeft,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { bookingService } from "../services/bookingService";
import { DateStep } from "../components/booking/steps/DateStep";
import { SlotStep } from "../components/booking/steps/SlotStep";

interface ManageState {
  view: "dashboard" | "reschedule-date" | "reschedule-slot";
  newDate: string;
  newTime: string;
}

const ManageBooking = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [booking, setBooking] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [rescheduling, setRescheduling] = React.useState(false);
  const [state, setState] = React.useState<ManageState>({
    view: "dashboard",
    newDate: "",
    newTime: "",
  });

  React.useEffect(() => {
    if (!token) {
      setError("No booking token provided.");
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const data = await bookingService.getBookingByTokenAPIRoute(token);
        setBooking(data);
      } catch (err: any) {
        setError(err.message || "Invalid or expired booking link.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const handleDateSelect = (date: string) => {
    setState((prev) => ({ ...prev, newDate: date, newTime: "" }));
  };

  const handleNextToSlots = () => {
    setState((prev) => ({ ...prev, view: "reschedule-slot" }));
  };

  const handleSlotSelect = async (time: string) => {
    setState((prev) => ({ ...prev, newTime: time }));
    setRescheduling(true);
    try {
      if (!token) throw new Error("No token");
      await bookingService.rescheduleByToken(token, state.newDate, time);

      // Reload booking
      const data = await bookingService.getBookingByTokenAPIRoute(token);
      setBooking(data);
      setState({ view: "dashboard", newDate: "", newTime: "" });
      // Optionally show success
    } catch (err: any) {
      setError(err.message || "Failed to reschedule. Please try again.");
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
      return `${h12}:${minutes.toString().padStart(2, "0")} ${period}`;
    } catch (e) {
      return time24;
    }
  };

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

  if (error || !booking) {
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
            {error || "We couldn't find a booking with this link."}
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
            <div className="mb-10 text-center">
              <h1 className="text-3xl md:text-4xl font-serif text-primary mb-3">
                Manage Your Session
              </h1>
              <p className="text-muted-foreground text-lg">
                Hi {booking.name}, here are your session details.
              </p>
            </div>

            <div className="bg-muted/10 rounded-3xl p-6 md:p-8 space-y-6 mb-10">
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

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                className="flex-1 h-14 rounded-full text-base"
                onClick={() => setState({ ...state, view: "reschedule-date" })}
                disabled={rescheduling}
              >
                Reschedule Session
              </Button>
            </div>
          </div>
        )}

        {state.view === "reschedule-date" && (
          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-primary/10">
            <DateStep
              selectedDate={state.newDate}
              onSelect={handleDateSelect}
              onNext={handleNextToSlots}
              onBack={() => setState({ ...state, view: "dashboard" })}
            />
          </div>
        )}

        {state.view === "reschedule-slot" && (
          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-primary/10">
            <SlotStep
              therapistId={booking.therapistId}
              date={state.newDate}
              onSelect={handleSlotSelect}
              onBack={() => setState({ ...state, view: "reschedule-date" })}
              lockingTime={rescheduling ? state.newTime : null}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageBooking;
