"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Calendar, CheckCircle, Clock, Video, CreditCard, Sparkles,
  ChevronRight, User, FileText, UserCog, Loader2, AlertCircle, RefreshCw, XCircle
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Booking, Therapist } from "@/types";
import { normalizeImageUrl } from "@/lib/utils";
import { SessionDetailsModal } from "@/components/dashboard/SessionDetailsModal";
import { RescheduleModal } from "@/components/dashboard/RescheduleModal";
import { CancelModal } from "@/components/dashboard/CancelModal";
import { SupportModal } from "@/components/dashboard/SupportModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useJoinSession } from "@/hooks/useJoinSession";
import {
  formatSessionDate, formatSessionTimeRange, formatDayBadge, SESSION_DURATION_LABEL
} from "@/lib/sessionDisplay";

interface UserProfile { name?: string; phone?: string; bio?: string; }

const statusLabel = (s: string) => s.replace(/_/g, " ");

function getStatusClasses(status: string) {
  if (status === "confirmed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "pending" || status === "pending_approval") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "awaiting_payment") return "bg-amber-100 text-amber-800 border-amber-300";
  if (status === "rejected") return "bg-red-50 text-red-600 border-red-100";
  if (status === "cancelled") return "bg-gray-50 text-gray-500 border-gray-100";
  if (status === "completed") return "bg-primary/5 text-primary border-primary/10";
  return "bg-primary/5 text-primary border-primary/10";
}

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Whether a session is unpaid/abandoned. Payment is upfront-only, so an
 *  unpaid/awaiting_payment booking is a stale hold — never a "pay now" prompt. */
function isUnpaidHold(b: Booking): boolean {
  return b.status === "awaiting_payment" || b.status === "pending_payment" || b.paymentStatus === "unpaid";
}

interface CompactCardProps {
  session: Booking;
  therapist?: Therapist;
  onOpen: () => void;
  onJoin?: () => void;
  joining?: boolean;
}

/** Compact session row used for the upcoming list and history. */
function CompactSessionCard({ session, therapist, onOpen, onJoin, joining }: CompactCardProps) {
  const unpaid = isUnpaidHold(session);
  const badge = formatDayBadge(session.date);
  const weekday = badge?.weekday ?? "";
  const day = badge?.day ?? "—";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white border border-primary/10 rounded-3xl p-5 hover:shadow-md hover:border-primary/20 transition-all duration-300 group flex items-center gap-4"
    >
      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-[#FFFBE7] border border-primary/5 shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-primary/50 font-sans">{weekday}</span>
        <span className="text-xl font-serif text-primary leading-none">{day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-[#E6A520] font-bold font-sans truncate">
            {session.sessionType || "1:1"} · {formatSessionTimeRange(session.time)}
          </span>
        </div>
        <h4 className="font-medium text-primary truncate">{therapist?.name || "Assigned Therapist"}</h4>
        <div className="mt-1 flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase tracking-wider font-medium border capitalize ${getStatusClasses(session.status)}`}>
            {statusLabel(session.status)}
          </span>
          {unpaid && (
            <span className="text-[10px] text-amber-700 font-sans">Payment not completed</span>
          )}
        </div>
      </div>
      {onJoin && session.status === "confirmed" ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onJoin(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onJoin(); } }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
        >
          {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
          Join
        </span>
      ) : unpaid ? (
        <Link
          href="/book"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-[#E6A520] hover:bg-[#c48b1a] text-white text-xs font-semibold rounded-xl transition-colors"
        >
          Book again
        </Link>
      ) : (
        <ChevronRight className="w-5 h-5 text-primary/30 group-hover:text-[#E6A520] group-hover:translate-x-1 transition-all shrink-0" />
      )}
    </button>
  );
}

function Dashboard() {
  const { currentUser } = useAuth();
  const {
    therapists, upcoming, past, bookings,
    initialLoading, error, refresh,
  } = useDashboardData();
  const { join, joiningId } = useJoinSession();

  const [profile, setProfile] = useState<UserProfile>({});
  const [selected, setSelected] = useState<Booking | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  // Load the user's stored profile (name/phone) for the welcome + support form.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentUser?.uid) return;
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (active && snap.exists()) setProfile(snap.data() as UserProfile);
      } catch {
        /* non-fatal: fall back to auth identity */
      }
    })();
    return () => { active = false; };
  }, [currentUser?.uid]);

  const displayName =
    profile.name || currentUser?.name || currentUser?.email?.split("@")[0] || "there";

  // Hero = soonest genuinely-actionable session (exclude unpaid/abandoned holds).
  const heroSession = useMemo(
    () => upcoming.find((b) =>
      (b.status === "confirmed" || b.status === "pending" || b.status === "pending_approval") &&
      !isUnpaidHold(b)
    ) || null,
    [upcoming]
  );
  const restUpcoming = useMemo(
    () => upcoming.filter((b) => b.id !== heroSession?.id),
    [upcoming, heroSession]
  );

  // Therapists the user has actually seen/booked (for the "My therapists" panel).
  const myTherapists = useMemo(() => {
    const ids = Array.from(new Set(bookings.map((b) => b.therapistId).filter(Boolean)));
    return ids.map((id) => therapists[id]).filter(Boolean);
  }, [bookings, therapists]);

  const openDetails = (s: Booking) => { setSelected(s); setDetailsOpen(true); };
  const openReschedule = (s: Booking) => { setSelected(s); setRescheduleOpen(true); };
  const openCancel = (s: Booking) => { setSelected(s); setCancelOpen(true); };

  // ---- Loading (first paint only) ----
  if (initialLoading) {
    return (
      <div className="pt-24 pb-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-6xl space-y-8">
          <Skeleton className="h-10 w-64 rounded-2xl" />
          <Skeleton className="h-56 w-full rounded-[2rem]" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-24 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    );
  }

  // ---- Hard error with nothing cached to show ----
  if (error && bookings.length === 0) {
    return (
      <div className="pt-24 pb-20 px-4 sm:px-6">
        <div className="container mx-auto max-w-md text-center bg-white border border-primary/10 rounded-[2rem] p-10 shadow-sm mt-10">
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

  const heroTherapist = heroSession ? therapists[heroSession.therapistId] : undefined;

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6">
      <div className="container mx-auto max-w-6xl">
        {/* Welcome */}
        <div className="mb-8">
          <p className="text-sm text-primary/50 font-sans">{greetingFor()},</p>
          <h1 className="text-3xl sm:text-4xl font-serif text-primary capitalize">{displayName}</h1>
          <p className="text-primary/60 font-sans mt-1 text-sm">
            Here&apos;s your space to reflect, prepare, and connect.
          </p>
        </div>

        {/* Soft inline warning when a refresh failed but we still have cached data */}
        {error && bookings.length > 0 && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 font-sans">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</span>
            <button onClick={() => refresh()} className="inline-flex items-center gap-1.5 font-medium hover:underline cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* ===== NEXT SESSION hero ===== */}
            {heroSession ? (
              <section
                aria-label="Your next session"
                className="relative overflow-hidden rounded-[2rem] border border-primary/10 bg-white shadow-sm"
              >
                <div className="absolute top-0 right-0 w-56 h-56 bg-[#E6A520]/5 rounded-bl-full pointer-events-none" />
                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#E6A520] font-bold font-sans">
                      <Sparkles className="w-3.5 h-3.5" /> Your next session
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] rounded-full uppercase tracking-wider font-medium border capitalize ${getStatusClasses(heroSession.status)}`}>
                      {statusLabel(heroSession.status)}
                    </span>
                  </div>

                  {/* Therapist */}
                  <div className="flex items-center gap-4 mb-6">
                    {heroTherapist?.image ? (
                      <div className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 border border-primary/10">
                        <Image src={normalizeImageUrl(heroTherapist.image)} alt={heroTherapist.name} fill className="object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-[#FFFBE7] flex items-center justify-center text-[#E6A520] font-serif text-2xl shrink-0 border border-primary/10">
                        {heroTherapist?.name?.charAt(0) || "T"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-[#E6A520] font-bold font-sans mb-0.5">
                        {heroSession.sessionType || "1:1"} Session
                      </p>
                      <h2 className="text-xl font-serif text-primary truncate">{heroTherapist?.name || "Assigned Therapist"}</h2>
                      <p className="text-sm text-primary/60 font-sans truncate">{heroTherapist?.specialization || "Therapist"}</p>
                    </div>
                  </div>

                  {/* Meta grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <div className="rounded-2xl bg-[#FFFBE7]/50 border border-primary/5 p-4">
                      <Calendar className="w-4 h-4 text-[#E6A520] mb-2" />
                      <p className="text-[10px] uppercase tracking-wider text-primary/40 font-sans mb-0.5">Date</p>
                      <p className="text-sm font-medium text-primary font-sans">{formatSessionDate(heroSession.date)}</p>
                    </div>
                    <div className="rounded-2xl bg-[#FFFBE7]/50 border border-primary/5 p-4">
                      <Clock className="w-4 h-4 text-[#E6A520] mb-2" />
                      <p className="text-[10px] uppercase tracking-wider text-primary/40 font-sans mb-0.5">Time · {SESSION_DURATION_LABEL}</p>
                      <p className="text-sm font-medium text-primary font-sans">{formatSessionTimeRange(heroSession.time)}</p>
                    </div>
                    <div className="rounded-2xl bg-[#FFFBE7]/50 border border-primary/5 p-4">
                      <Video className="w-4 h-4 text-[#E6A520] mb-2" />
                      <p className="text-[10px] uppercase tracking-wider text-primary/40 font-sans mb-0.5">Mode</p>
                      <p className="text-sm font-medium text-primary font-sans capitalize">{heroSession.sessionMode || "Video Call"}</p>
                    </div>
                    <div className="rounded-2xl bg-[#FFFBE7]/50 border border-primary/5 p-4">
                      <CreditCard className="w-4 h-4 text-[#E6A520] mb-2" />
                      <p className="text-[10px] uppercase tracking-wider text-primary/40 font-sans mb-0.5">Payment</p>
                      <p className={`text-sm font-medium font-sans capitalize ${heroSession.paymentStatus === "paid" ? "text-emerald-600" : "text-[#E6A520]"}`}>
                        {heroSession.paymentStatus || "unpaid"}
                      </p>
                    </div>
                  </div>
                  {/* Meeting availability — honest about what exists right now */}
                  <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-primary/5 bg-white px-4 py-3 text-xs font-sans">
                    {heroSession.status !== "confirmed" ? (
                      <>
                        <Clock className="w-4 h-4 text-[#E6A520] shrink-0 mt-0.5" />
                        <span className="text-primary/60">
                          Your therapist is confirming this session. The meeting link appears here once it&apos;s confirmed.
                        </span>
                      </>
                    ) : heroSession.meetingUrl ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-primary/70">Your Google Meet link is ready — join from here at your session time.</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 text-[#E6A520] shrink-0 mt-0.5" />
                        <span className="text-primary/60">
                          Your meeting link is being prepared. Use Join session and we&apos;ll fetch it for you.
                        </span>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    {heroSession.status === "confirmed" && (
                      <button
                        onClick={() => join(heroSession)}
                        disabled={joiningId === heroSession.id}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-2xl shadow-sm transition-all cursor-pointer font-sans"
                      >
                        {joiningId === heroSession.id
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>
                          : <><Video className="w-4 h-4" /> Join session</>}
                      </button>
                    )}
                    <button
                      onClick={() => openReschedule(heroSession)}
                      className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-primary/15 hover:bg-primary/5 text-primary text-sm font-medium rounded-2xl transition-all cursor-pointer font-sans"
                    >
                      <RefreshCw className="w-4 h-4" /> Reschedule
                    </button>
                    <button
                      onClick={() => openDetails(heroSession)}
                      className="inline-flex items-center gap-2 px-5 py-3 text-primary/70 hover:text-primary text-sm font-medium rounded-2xl transition-colors cursor-pointer font-sans"
                    >
                      <FileText className="w-4 h-4" /> Details
                    </button>
                    <button
                      onClick={() => openCancel(heroSession)}
                      className="inline-flex items-center gap-2 px-5 py-3 text-red-600/80 hover:text-red-700 text-sm font-medium rounded-2xl transition-colors cursor-pointer font-sans sm:ml-auto"
                    >
                      <XCircle className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section
                aria-label="No upcoming session"
                className="relative overflow-hidden rounded-[2rem] border border-primary/10 bg-white shadow-sm p-8 sm:p-10 text-center"
              >
                <div className="absolute top-0 right-0 w-48 h-48 bg-[#E6A520]/5 rounded-bl-full pointer-events-none" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-[#FFFBE7] border border-primary/10 flex items-center justify-center mx-auto mb-5">
                    <Calendar className="w-7 h-7 text-[#E6A520]" />
                  </div>
                  <h2 className="text-2xl font-serif text-primary mb-2">No sessions scheduled yet</h2>
                  <p className="text-sm text-primary/60 font-sans max-w-md mx-auto mb-6">
                    When you&apos;re ready, choose a time that suits you. Your next {SESSION_DURATION_LABEL.toLowerCase()} session
                    will appear right here with everything you need to join.
                  </p>
                  <Link
                    href="/book"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white text-sm font-semibold rounded-full hover:bg-primary/90 shadow-sm transition-colors font-sans"
                  >
                    <Sparkles className="w-4 h-4" /> Book a session
                  </Link>
                </div>
              </section>
            )}
            {/* ===== Other upcoming sessions ===== */}
            {restUpcoming.length > 0 && (
              <section aria-labelledby="upcoming-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 id="upcoming-heading" className="text-lg font-serif text-primary">Also coming up</h3>
                  <Link href="/dashboard/bookings" className="text-xs font-medium text-primary/50 hover:text-primary font-sans inline-flex items-center gap-1">
                    All sessions <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {restUpcoming.map((s) => (
                    <CompactSessionCard
                      key={s.id}
                      session={s}
                      therapist={therapists[s.therapistId]}
                      onOpen={() => openDetails(s)}
                      onJoin={() => join(s)}
                      joining={joiningId === s.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ===== History ===== */}
            {past.length > 0 && (
              <section aria-labelledby="history-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 id="history-heading" className="text-lg font-serif text-primary">Your journey so far</h3>
                  {past.length > 4 && (
                    <Link href="/dashboard/bookings" className="text-xs font-medium text-primary/50 hover:text-primary font-sans inline-flex items-center gap-1">
                      View all {past.length} <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {past.slice(0, 4).map((s) => (
                    <CompactSessionCard
                      key={s.id}
                      session={s}
                      therapist={therapists[s.therapistId]}
                      onOpen={() => openDetails(s)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
          {/* ===== Sidebar ===== */}
          <aside className="space-y-6">
            {/* Book a session */}
            <div className="rounded-[2rem] border border-primary/10 bg-primary text-white p-6 shadow-sm relative overflow-hidden">
              <div className="absolute -bottom-8 -right-8 w-40 h-40 bg-[#E6A520]/20 rounded-full pointer-events-none" />
              <div className="relative">
                <Sparkles className="w-5 h-5 text-[#E6A520] mb-3" />
                <h3 className="text-lg font-serif mb-1.5">Make space for yourself</h3>
                <p className="text-sm text-white/70 font-sans mb-5">
                  Book a {SESSION_DURATION_LABEL.toLowerCase()} session with a therapist who fits you.
                </p>
                <Link
                  href="/book"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E6A520] hover:bg-[#c48b1a] text-primary text-sm font-semibold rounded-full transition-colors font-sans"
                >
                  Book a session <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* My therapists */}
            {myTherapists.length > 0 && (
              <div className="rounded-[2rem] border border-primary/10 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-sans mb-4 flex items-center gap-2">
                  <User className="w-4 h-4 text-[#E6A520]" /> Your therapists
                </h3>
                <ul className="space-y-3">
                  {myTherapists.map((t) => (
                    <li key={t.id} className="flex items-center gap-3">
                      {t.image ? (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 border border-primary/10">
                          <Image src={normalizeImageUrl(t.image)} alt={t.name} fill className="object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#FFFBE7] border border-primary/10 flex items-center justify-center text-[#E6A520] font-serif shrink-0">
                          {t.name?.charAt(0) || "T"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-primary truncate">{t.name}</p>
                        <p className="text-xs text-primary/50 font-sans truncate">{t.specialization || "Therapist"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Support */}
            <div className="rounded-[2rem] border border-primary/10 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider font-sans mb-2 flex items-center gap-2">
                <UserCog className="w-4 h-4 text-[#E6A520]" /> Need a hand?
              </h3>
              <p className="text-sm text-primary/60 font-sans mb-4">
                Questions about a session, payment, or your account — our care team replies personally.
              </p>
              <button
                onClick={() => setSupportOpen(true)}
                className="w-full py-2.5 text-sm font-medium text-primary border border-primary/15 hover:bg-primary/5 rounded-full transition-colors cursor-pointer font-sans"
              >
                Contact support
              </button>
            </div>
          </aside>
        </div>
      </div>
      {/* ===== Modals ===== */}
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

      <SupportModal
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        userEmail={currentUser?.email || ""}
        userName={profile.name || currentUser?.name || ""}
        userPhone={profile.phone || ""}
      />
    </div>
  );
}

export default function DashboardRoute() {
  return (
    <ProtectedRoute allowedRoles={["client", "admin"]}>
      <Dashboard />
    </ProtectedRoute>
  );
}
