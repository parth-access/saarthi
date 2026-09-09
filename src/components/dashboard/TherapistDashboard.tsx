import * as React from "react";
import { format, parseISO, isToday } from "date-fns";
import {
  RefreshCw,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  Bell,
  Sun,
  Moon,
  Coffee,
  CheckCircle2,
  LayoutGrid,
  User,
  Search,
  ChevronDown,
  Video,
  CalendarDays,
  Users,
  MessageSquare,
  Mail,
  Sliders,
  Phone,
  Stethoscope,
} from "lucide-react";
import { Booking, BookingStatus, Therapist } from "../../types";
import { cn, toDateSafe } from "../../lib/utils";
import { OperationsPanel } from "../admin/OperationsPanel";
import { isValidClientAge, parseAgeInput } from "@/shared/validation/age";
import { Button } from "@/components/ui/Button";
import { CopyableId } from "@/components/admin/bookings/CopyableId";
import { useJoinSession } from "@/hooks/useJoinSession";
import {
  statusBadge,
  paymentBadge,
  toneClasses,
} from "@/components/admin/bookings/adminBookingPresentation";

interface TherapistDashboardProps {
  therapist: Therapist | null;
  bookings: Booking[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  onLogout: () => void;
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  onDeclineRequest: (booking: Booking) => void;
  processingId: string | null;
  scheduleBuilderNode?: React.ReactNode;
  adminTherapistsNode?: React.ReactNode;
  contactsNode?: React.ReactNode;
  emailLogsNode?: React.ReactNode;
  isAdmin?: boolean;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good Morning", icon: Coffee };
  if (hour < 17) return { text: "Good Afternoon", icon: Sun };
  return { text: "Good Evening", icon: Moon };
};

/**
 * Renders an intake age for the therapist card.
 * Handles absent or invalid stored values transparently.
 */
const formatAgeLabel = (age: unknown): string | null => {
  const parsed = parseAgeInput(age);
  if (parsed === null) return null;
  return isValidClientAge(parsed) ? `${parsed}y` : `${parsed}y (unverified)`;
};

export const TherapistDashboard: React.FC<TherapistDashboardProps> = ({
  therapist,
  bookings,
  loading,
  error,
  onRefresh,
  onLogout,
  onUpdateStatus,
  onDeclineRequest,
  processingId,
  scheduleBuilderNode,
  adminTherapistsNode,
  contactsNode,
  emailLogsNode,
  isAdmin,
}) => {
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "sessions" | "schedule" | "therapists" | "contacts" | "emails" | "operations"
  >("overview");

  // Filter state for master session ledger
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | "all">("all");
  const [dateFilter, setDateFilter] = React.useState("");

  const greeting = React.useMemo(() => getGreeting(), []);
  const GreetingIcon = greeting.icon;

  // Categorization
  const todayBookings = React.useMemo(
    () =>
      bookings.filter((b) => {
        if (!b.date) return false;
        try {
          return isToday(parseISO(b.date));
        } catch {
          return false;
        }
      }),
    [bookings]
  );

  const pendingBookings = React.useMemo(
    () => bookings.filter((b) => b.status === "pending" || b.status === "pending_approval"),
    [bookings]
  );

  const upcomingBookings = React.useMemo(
    () =>
      bookings.filter(
        (b) =>
          (b.status === "confirmed" || b.status === "awaiting_payment") &&
          (!b.date || !isToday(parseISO(b.date)))
      ),
    [bookings]
  );

  const recentBookings = React.useMemo(
    () =>
      bookings
        .filter(
          (b) => b.status === "completed" || b.status === "cancelled" || b.status === "rejected"
        )
        .slice(0, 6),
    [bookings]
  );

  // Filtered master list
  const filteredBookings = React.useMemo(() => {
    return bookings.filter((b) => {
      const matchesSearch =
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.phone && b.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        b.sessionType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || b.status === statusFilter;
      const matchesDate = !dateFilter || b.date === dateFilter;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [bookings, searchTerm, statusFilter, dateFilter]);

  const displayName = isAdmin ? "Administrator" : therapist?.name?.split(" ")[0] || "Therapist";
  const fullName = isAdmin ? "Administrator" : therapist?.name || "Therapist";

  const isInitialLoading = loading && bookings.length === 0 && !therapist && !isAdmin;

  if (isInitialLoading) {
    return (
      <div className="admin-dense min-h-screen bg-background text-primary font-sans">
        {/* Loading header */}
        <header className="border-b border-hairline bg-background/95 backdrop-blur-xs sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-4 w-32 bg-neutral-surface rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 bg-neutral-surface rounded-lg animate-pulse" />
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-20 bg-white rounded-xl border border-hairline animate-pulse"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-4">
              <div className="h-40 bg-white rounded-xl border border-hairline animate-pulse" />
              <div className="h-40 bg-white rounded-xl border border-hairline animate-pulse" />
            </div>
            <div className="lg:col-span-4 space-y-4">
              <div className="h-64 bg-white rounded-xl border border-hairline animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-dense min-h-screen bg-background text-primary font-sans antialiased">
      {/* PERSISTENT TOP APP BAR */}
      <header className="border-b border-hairline bg-background/95 backdrop-blur-xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Identity & Workspace */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif font-semibold text-base text-primary tracking-tight">
                Saarthi
              </span>
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded bg-primary text-white">
                Clinical
              </span>
            </div>

            <div className="hidden sm:block h-4 w-px bg-hairline" />

            <div className="hidden sm:flex items-center gap-2 text-xs">
              <GreetingIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-primary truncate">
                {greeting.text}, {isAdmin ? "Admin Console" : `Dr. ${displayName}`}
              </span>
              <span className="inline-flex items-center gap-1 text-[0.6875rem] text-success font-medium bg-success-surface px-1.5 py-0.5 rounded border border-success/30">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                Active
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            {pendingBookings.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning-surface text-warning border border-warning/30 text-xs font-semibold hover:bg-warning-surface/80 transition-colors"
                title={`${pendingBookings.length} pending request(s) awaiting response`}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{pendingBookings.length} pending</span>
              </button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-1.5 text-xs"
              title="Sync session data from server"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-xs text-muted-foreground hover:text-danger hover:bg-danger-surface transition-colors"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* SUB-HEADER / WORKSPACE NAVIGATION */}
      <div className="border-b border-hairline bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav
            className="flex items-center gap-1.5 overflow-x-auto py-2 no-scrollbar"
            aria-label="Therapist workspace tabs"
          >
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                activeTab === "overview"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Clinical Overview
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("sessions")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                activeTab === "sessions"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              All Sessions
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded text-[0.625rem] font-mono",
                  activeTab === "sessions"
                    ? "bg-white/20 text-white"
                    : "bg-neutral-surface text-muted-foreground"
                )}
              >
                {bookings.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("schedule")}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                activeTab === "schedule"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Availability & Rules
            </button>

            {adminTherapistsNode && (
              <button
                type="button"
                onClick={() => setActiveTab("therapists")}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  activeTab === "therapists"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Manage Therapists
              </button>
            )}

            {contactsNode && (
              <button
                type="button"
                onClick={() => setActiveTab("contacts")}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  activeTab === "contacts"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Inquiries
              </button>
            )}

            {emailLogsNode && (
              <button
                type="button"
                onClick={() => setActiveTab("emails")}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  activeTab === "emails"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                Email Logs
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("operations")}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  activeTab === "operations"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted-foreground hover:text-primary hover:bg-neutral-surface/60"
                )}
              >
                <Sliders className="h-3.5 w-3.5" />
                Control Room
              </button>
            )}
          </nav>
        </div>
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Notification */}
        {error && (
          <div className="mb-6 p-4 bg-danger-surface border border-danger/30 rounded-xl flex items-start gap-3 text-danger text-xs animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Notice:</span> {error}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: CLINICAL OVERVIEW                                      */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* NEEDS ATTENTION BANNER */}
            {pendingBookings.length > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-warning/20 text-warning flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-warning font-sans">
                      Action Required: {pendingBookings.length} Session Request
                      {pendingBookings.length > 1 ? "s" : ""}
                    </h2>
                    <p className="text-xs text-warning/90 mt-0.5">
                      Review requests below. Confirm to send a payment link or decline with an
                      optional client note.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const el = document.getElementById("pending-requests-section");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="bg-white/80 border-warning/30 text-warning hover:bg-white text-xs whitespace-nowrap"
                >
                  Review Requests
                </Button>
              </div>
            )}

            {/* CLINICAL STATS METRICS STRIP */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                title="Today's Sessions"
                value={todayBookings.length}
                subtitle="Scheduled for today"
                icon={Clock}
                highlight={todayBookings.length > 0}
              />
              <MetricCard
                title="Pending Requests"
                value={pendingBookings.length}
                subtitle="Awaiting response"
                icon={AlertCircle}
                tone={pendingBookings.length > 0 ? "warning" : "default"}
              />
              <MetricCard
                title="Upcoming Confirmed"
                value={upcomingBookings.length}
                subtitle="Future appointments"
                icon={CheckCircle2}
              />
              <MetricCard
                title="Handled / Completed"
                value={recentBookings.length}
                subtitle="Processed records"
                icon={LayoutGrid}
              />
            </div>

            {/* 2-COLUMN CLINICAL DASHBOARD LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* PRIMARY CLINICAL COLUMN (70%) */}
              <div className="lg:col-span-8 space-y-6">
                {/* 1. TODAY'S SESSIONS (PRIMARY FOCUS) */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-primary font-serif">
                        Today&apos;s Schedule
                      </h2>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(new Date(), "EEEE, MMM d, yyyy")}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {todayBookings.length} session{todayBookings.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {todayBookings.length === 0 ? (
                    <div className="rounded-xl border border-hairline bg-white p-6 text-center">
                      <p className="text-xs text-muted-foreground italic">
                        No sessions scheduled for today. Your schedule is clear.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {todayBookings.map((b) => (
                        <ClinicalSessionCard
                          key={b.id}
                          booking={b}
                          isProcessing={processingId === b.id}
                          onUpdateStatus={onUpdateStatus}
                          onDeclineRequest={onDeclineRequest}
                          isTodaySession
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* 2. PENDING REQUESTS (AWAITING RESPONSE) */}
                <section id="pending-requests-section" className="space-y-3">
                  <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-primary font-serif">
                        Session Requests
                      </h2>
                      {pendingBookings.length > 0 && (
                        <span className="px-2 py-0.5 rounded text-[0.6875rem] font-semibold bg-warning-surface text-warning border border-warning/30">
                          {pendingBookings.length} New
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">Requires your response</span>
                  </div>

                  {pendingBookings.length === 0 ? (
                    <div className="rounded-xl border border-hairline bg-white p-6 text-center">
                      <p className="text-xs text-muted-foreground italic">
                        No pending session requests at this time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingBookings.map((b) => (
                        <ClinicalSessionCard
                          key={b.id}
                          booking={b}
                          isProcessing={processingId === b.id}
                          onUpdateStatus={onUpdateStatus}
                          onDeclineRequest={onDeclineRequest}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {/* 3. UPCOMING CONFIRMED SESSIONS */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                    <h2 className="text-base font-semibold text-primary font-serif">
                      Upcoming Sessions
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {upcomingBookings.length} confirmed
                    </span>
                  </div>

                  {upcomingBookings.length === 0 ? (
                    <div className="rounded-xl border border-hairline bg-white p-6 text-center">
                      <p className="text-xs text-muted-foreground italic">
                        No upcoming sessions beyond today.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingBookings.map((b) => (
                        <ClinicalSessionCard
                          key={b.id}
                          booking={b}
                          isProcessing={processingId === b.id}
                          onUpdateStatus={onUpdateStatus}
                          onDeclineRequest={onDeclineRequest}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* CONTEXT SIDEBAR (30%) */}
              <div className="lg:col-span-4 space-y-4">
                {/* PRACTITIONER PROFILE SUMMARY CARD */}
                <div className="rounded-xl border border-hairline bg-white p-4 shadow-xs">
                  <div className="flex items-center gap-3 mb-3">
                    {therapist?.image ? (
                      <img
                        src={therapist.image}
                        alt={fullName}
                        className="w-12 h-12 rounded-lg object-cover border border-hairline"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-neutral-surface border border-hairline flex items-center justify-center text-primary/50">
                        <Stethoscope className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-serif font-semibold text-sm text-primary">
                        {isAdmin ? "Administrator" : `Dr. ${fullName}`}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {therapist?.specialization || "Clinical Practice"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-hairline pt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Standard Session:</span>
                      <span className="font-semibold text-primary">45 Minutes</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Time Zone:</span>
                      <span className="font-semibold text-primary">IST (UTC+5:30)</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Availability Mode:</span>
                      <span className="font-semibold text-success flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        Online & Video
                      </span>
                    </div>
                  </div>
                </div>

                {/* TODAY'S TIMELINE AT A GLANCE */}
                <div className="rounded-xl border border-hairline bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/60 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Day Timeline Glance
                    </h3>
                    <span className="tabular text-[0.6875rem] text-muted-foreground font-mono">
                      {todayBookings.length} appt{todayBookings.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {todayBookings.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">
                      Schedule is clear for today.
                    </p>
                  ) : (
                    <div className="space-y-2 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-hairline">
                      {todayBookings.map((b) => (
                        <div key={b.id} className="relative pl-6 text-xs">
                          <div
                            className={cn(
                              "absolute left-1 top-1.5 w-2 h-2 rounded-full ring-2 ring-white",
                              b.status === "confirmed"
                                ? "bg-success"
                                : b.status === "awaiting_payment"
                                ? "bg-info"
                                : "bg-warning"
                            )}
                          />
                          <div className="flex items-center justify-between bg-neutral-surface/40 p-2 rounded-lg border border-hairline">
                            <div>
                              <div className="font-semibold text-primary tabular font-mono">
                                {b.time} IST
                              </div>
                              <div className="text-muted-foreground font-medium truncate max-w-[130px]">
                                {b.name}
                              </div>
                            </div>
                            <span className="text-[0.625rem] text-muted-foreground">45m</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RECENT ACTIVITY */}
                <div className="rounded-xl border border-hairline bg-white p-4 shadow-xs">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-primary/60 mb-3">
                    Recent History
                  </h3>
                  {recentBookings.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">
                      Recent records will appear here.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recentBookings.map((b) => {
                        const badge = statusBadge(b);
                        return (
                          <div
                            key={b.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-neutral-surface/30 border border-hairline text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-medium text-primary truncate">{b.name}</div>
                              <div className="text-[0.6875rem] text-muted-foreground">
                                {b.date ? format(parseISO(b.date), "MMM d") : "—"} • {b.time}
                              </div>
                            </div>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[0.625rem] font-medium border shrink-0",
                                toneClasses(badge.tone)
                              )}
                            >
                              {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: ALL SESSIONS (MASTER LEDGER)                           */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "sessions" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="rounded-xl border border-hairline bg-white p-4 shadow-xs">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by client name, email, phone, or session type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-neutral-surface/40 border border-hairline text-xs text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Dropdown */}
                <div className="relative min-w-[160px]">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as BookingStatus | "all")}
                    className="w-full h-9 rounded-lg bg-neutral-surface/40 border border-hairline px-3 pr-8 text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none transition-colors cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="awaiting_payment">Awaiting Payment</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="rejected">Rejected</option>
                    <option value="no_show">No-Show</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>

                {/* Date Filter */}
                <div className="relative min-w-[150px]">
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full h-9 rounded-lg bg-neutral-surface/40 border border-hairline px-3 text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer"
                  />
                  {dateFilter && (
                    <button
                      type="button"
                      onClick={() => setDateFilter("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {(searchTerm || statusFilter !== "all" || dateFilter) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("all");
                      setDateFilter("");
                    }}
                    className="text-xs text-muted-foreground hover:text-primary whitespace-nowrap"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-hairline flex items-center justify-between text-[0.6875rem] text-muted-foreground">
                <span>
                  Showing <strong className="text-primary">{filteredBookings.length}</strong> of{" "}
                  {bookings.length} recorded sessions
                </span>
                <span className="font-mono">IST Wall-Clock</span>
              </div>
            </div>

            {/* Sessions List */}
            {filteredBookings.length === 0 ? (
              <div className="rounded-xl border border-hairline bg-white p-8 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  No sessions match your active filter criteria.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("all");
                    setDateFilter("");
                  }}
                  className="text-xs"
                >
                  Reset Filters
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBookings.map((b) => (
                  <ClinicalSessionCard
                    key={b.id}
                    booking={b}
                    isProcessing={processingId === b.id}
                    onUpdateStatus={onUpdateStatus}
                    onDeclineRequest={onDeclineRequest}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: AVAILABILITY & RULES (SCHEDULE BUILDER)                */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "schedule" && (
          <div className="space-y-4">
            <div className="border-b border-hairline pb-2">
              <h2 className="text-base font-semibold text-primary font-serif">
                Therapist Availability & Working Hours
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure your weekly operating hours, session durations (45m standard), buffer
                cooldowns, and day overrides.
              </p>
            </div>
            {scheduleBuilderNode}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: MANAGE THERAPISTS (ADMIN ONLY)                          */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "therapists" && adminTherapistsNode}

        {/* ------------------------------------------------------------- */}
        {/* TAB 5: CONTACTS & INQUIRIES (ADMIN ONLY)                       */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "contacts" && contactsNode}

        {/* ------------------------------------------------------------- */}
        {/* TAB 6: EMAIL LOGS (ADMIN ONLY)                                 */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "emails" && emailLogsNode}

        {/* ------------------------------------------------------------- */}
        {/* TAB 7: OPERATIONS CONTROL ROOM (ADMIN ONLY)                    */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "operations" && (
          <div className="rounded-xl border border-hairline bg-white p-6 shadow-xs">
            <OperationsPanel />
          </div>
        )}
      </main>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* REUSABLE SUB-COMPONENTS                                                    */
/* -------------------------------------------------------------------------- */

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ElementType;
  tone?: "default" | "warning";
  highlight?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "default",
  highlight = false,
}) => (
  <div
    className={cn(
      "p-3.5 rounded-xl border transition-all duration-200 shadow-xs flex flex-col justify-between",
      tone === "warning"
        ? "bg-warning-surface/50 border-warning/30 text-warning"
        : highlight
        ? "bg-white border-primary/40"
        : "bg-white border-hairline"
    )}
  >
    <div className="flex items-center justify-between">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </span>
      <Icon
        className={cn(
          "h-4 w-4",
          tone === "warning" ? "text-warning" : "text-muted-foreground"
        )}
      />
    </div>
    <div className="mt-2 flex items-baseline justify-between">
      <span className="text-2xl font-serif font-semibold text-primary tabular">{value}</span>
      {subtitle && (
        <span className="text-[0.6875rem] text-muted-foreground hidden sm:inline">{subtitle}</span>
      )}
    </div>
  </div>
);

interface ClinicalSessionCardProps {
  booking: Booking;
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  onDeclineRequest: (booking: Booking) => void;
  isProcessing: boolean;
  isTodaySession?: boolean;
}

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
    </div>
  );
};
