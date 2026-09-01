"use client";

import { useState, useMemo } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock, Video, CreditCard, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Booking } from "@/types";
import { normalizeImageUrl } from "@/lib/utils";
import { RescheduleModal } from "@/components/dashboard/RescheduleModal";
import { CancelModal } from "@/components/dashboard/CancelModal";
import { SessionDetailsModal } from "@/components/dashboard/SessionDetailsModal";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useJoinSession } from "@/hooks/useJoinSession";
import {
  formatSessionDate, formatSessionTimeRange, SESSION_DURATION_LABEL, isUpcoming
} from "@/lib/sessionDisplay";

type Filter = "all" | "upcoming" | "completed" | "cancelled" | "rejected" | "unpaid";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "unpaid", label: "Unpaid" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rejected", label: "Rejected" },
];

function getStatusClasses(status: string) {
  if (status === "confirmed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending" || status === "pending_approval") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "awaiting_payment" || status === "pending_payment") return "bg-amber-100 text-amber-800 border-amber-300";
  if (status === "rejected") return "bg-red-50 text-red-600 border-red-100";
  if (status === "cancelled" || status === "expired" || status === "no_show") return "bg-gray-50 text-gray-500 border-gray-100";
  return "bg-primary/5 text-primary border-primary/10";
}

const isUnpaidHold = (b: Booking) =>
  b.status === "awaiting_payment" || b.status === "pending_payment" || b.paymentStatus === "unpaid";

function DashboardBookings() {
  const { bookings, therapists, initialLoading, error, refresh } = useDashboardData();
  const { join, joiningId } = useJoinSession();

  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (filter === "upcoming") {
        return isUpcoming(b) && b.status !== "cancelled" && b.status !== "rejected" && b.status !== "expired";
      }
      if (filter === "completed") return b.status === "completed";
      if (filter === "cancelled") return b.status === "cancelled";
      if (filter === "rejected") return b.status === "rejected";
      if (filter === "unpaid") return isUnpaidHold(b);
      return true;
    });
  }, [bookings, filter]);

  if (initialLoading) {
    return (
      <div className="pt-28 pb-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-10 w-56 rounded-2xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full rounded-3xl" />
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error && bookings.length === 0) {
    return (
      <div className="pt-28 pb-24 px-4 sm:px-6">
        <div className="container mx-auto max-w-md text-center bg-white border border-primary/10 rounded-[2rem] p-10 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-xl font-serif text-primary mb-2">We hit a snag</h2>
          <p className="text-sm text-primary/60 font-sans mb-6">{error}</p>
          <button
            onClick={() => refresh()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-medium rounded-full hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-24 px-4 sm:px-6">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-8 font-sans">
          <Link href="/dashboard" className="inline-flex items-center text-sm font-medium text-primary/60 hover:text-primary mb-6 transition-colors">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <h1 className="text-3xl sm:text-4xl font-serif text-primary">All sessions</h1>

            <div role="tablist" aria-label="Filter sessions" className="flex flex-wrap bg-white rounded-3xl p-1.5 border border-primary/10 shadow-sm w-fit gap-1 sm:gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                    filter === f.key ? "bg-primary text-white shadow-sm" : "text-primary/60 hover:text-primary hover:bg-black/5"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && bookings.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-sans">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</span>
            <button onClick={() => refresh()} className="inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        <div className="bg-white/50 border border-primary/10 rounded-[2.5rem] p-4 sm:p-8 shadow-sm">
          {filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-primary/5 font-sans">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-primary/20" />
              <p className="text-primary/60 mb-5">
                {bookings.length === 0
                  ? "You haven't booked a session yet."
                  : `No ${filter === "all" ? "" : FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} sessions to show.`}
              </p>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-full hover:bg-primary/90 transition-colors"
              >
                Book a session <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filtered.map((session) => {
                const t = therapists[session.therapistId];
                const unpaid = isUnpaidHold(session);
                const canReschedule =
                  isUpcoming(session) &&
                  (session.status === "confirmed" || session.status === "pending" || session.status === "pending_approval");
                return (
                  <div
                    key={session.id}
                    className={`border rounded-3xl p-6 hover:shadow-md transition-all duration-300 flex flex-col h-full relative overflow-hidden ${
                      unpaid ? "border-amber-200 bg-white" : "border-primary/10 hover:border-primary/20 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div className="flex gap-4 items-center min-w-0">
                        {t?.image ? (
                          <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 border border-primary/10">
                            <Image src={normalizeImageUrl(t.image)} alt={t.name} fill className="object-cover" referrerPolicy="no-referrer" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#FFFBE7] flex items-center justify-center text-[#E6A520] font-serif shrink-0 border border-primary/10">
                            {t?.name?.charAt(0) || "T"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-widest text-[#E6A520] font-bold mb-1 font-sans">
                            {session.sessionType || "1:1"} Session
                          </p>
                          <h3 className="font-semibold text-base text-primary truncate">{t?.name || "Assigned Therapist"}</h3>
                        </div>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 text-[10px] rounded-full uppercase tracking-wider font-medium border capitalize font-sans ${getStatusClasses(session.status)}`}>
                        {session.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 py-4 border-y border-primary/5 text-sm mb-4 bg-[#FFFBE7]/30 -mx-6 px-6 flex-1 font-sans">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#E6A520]/80 shrink-0" />
                        <span className="font-medium text-primary">{formatSessionDate(session.date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#E6A520]/80 shrink-0" />
                        <span className="font-medium text-primary">{formatSessionTimeRange(session.time)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-primary/40 shrink-0" />
                        <span className="font-medium text-primary/70 capitalize">{session.sessionMode || "Video call"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-primary/40 shrink-0" />
                        <span className={`capitalize font-semibold text-xs ${session.paymentStatus === "paid" ? "text-emerald-700" : "text-amber-800"}`}>
                          {session.paymentStatus || "unpaid"}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-primary/40 font-sans mb-4">{SESSION_DURATION_LABEL} session</p>

                    <div className="flex flex-wrap items-center gap-2">
                      {session.status === "confirmed" && (
                        <button
                          disabled={joiningId === session.id}
                          onClick={() => join(session)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm cursor-pointer transition-colors font-sans"
                        >
                          {joiningId === session.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                            : <><Video className="w-3.5 h-3.5" /> Join</>}
                        </button>
                      )}
                      {canReschedule && (
                        <button
                          onClick={() => { setSelected(session); setRescheduleOpen(true); }}
                          className="px-3.5 py-2 bg-white hover:bg-primary/5 border border-primary/15 text-primary font-medium text-xs rounded-xl cursor-pointer transition-all font-sans"
                        >
                          Reschedule
                        </button>
                      )}
                      {unpaid && (
                        <Link
                          href="/book"
                          className="px-3.5 py-2 bg-[#E6A520] hover:bg-[#c48b1a] text-white font-semibold text-xs rounded-xl shadow-sm transition-colors font-sans"
                        >
                          Book again
                        </Link>
                      )}
                      <button
                        onClick={() => { setSelected(session); setDetailsOpen(true); }}
                        className="ml-auto inline-flex items-center text-xs font-medium text-primary/50 hover:text-[#E6A520] transition-colors font-sans cursor-pointer"
                      >
                        Details <ChevronRight className="w-4 h-4 ml-0.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <SessionDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        session={selected}
        therapist={selected ? therapists[selected.therapistId] : undefined}
        onReschedule={() => setRescheduleOpen(true)}
        onCancel={() => setCancelOpen(true)}
      />

      <RescheduleModal
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        session={selected}
        onRescheduled={() => { refresh(); }}
      />

      <CancelModal
        isOpen={cancelOpen}
        onClose={() => setCancelOpen(false)}
        session={selected}
        onCancelled={() => { refresh(); }}
      />
    </div>
  );
}

export default function DashboardBookingsRoute() {
  return (
    <ProtectedRoute allowedRoles={["client", "admin"]}>
      <DashboardBookings />
    </ProtectedRoute>
  );
}
