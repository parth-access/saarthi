"use client";


import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { therapistService } from '@/services/therapistService';
import { 
  User, 
  XCircle, 
  Loader2, 
  ChevronDown
} from "lucide-react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { BookingStatus, Booking, Therapist } from "@/types"
import { bookingService } from "@/services/bookingService"
import { useAuth } from "@/contexts/AuthContext"
import { TherapistDashboard } from "@/components/dashboard/TherapistDashboard"
import { ScheduleBuilder } from "@/components/dashboard/ScheduleBuilder"
import { ContactsPanel } from "@/components/admin/ContactsPanel"
import { EmailLogsPanel } from "@/components/admin/EmailLogsPanel"

const getErrorMessage = (err: unknown, fallback = "An unexpected error occurred."): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
};

export const AdminPage = () => {
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [processingId, setProcessingId] = React.useState<string | null>(null)
  const [processingTherapistId, setProcessingTherapistId] = React.useState<string | null>(null)
  
  const { currentUser } = useAuth()
  const [myTherapistProfile, setMyTherapistProfile] = React.useState<Therapist | null>(null)

  const navigate = useRouter()
  const { logout } = useAuth()

  // Global Admin States
  const [allTherapists, setAllTherapists] = React.useState<Therapist[]>([])
  const [adminSelectedTherapistId, setAdminSelectedTherapistId] = React.useState<string>("")

  // Decline states
  const [declineBookingDoc, setDeclineBookingDoc] = React.useState<Booking | null>(null)
  const [declineReason, setDeclineReason] = React.useState("Therapist unavailable")
  const [declineNote, setDeclineNote] = React.useState("")
  const [isDeclining, setIsDeclining] = React.useState(false)

  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      
      if (!currentUser?.uid) return;
      
      if (currentUser.role === 'admin') {
        const ths = await therapistService.getTherapists(true);
        setAllTherapists(ths);
        setAdminSelectedTherapistId(prev => (prev || (ths.length > 0 ? ths[0].id : "")));

        const data = await bookingService.getBookings();
        setBookings(data)
      } else {
        // Therapist Logic
        const therapist = await therapistService.getTherapistByAuthId(currentUser.uid);
        setMyTherapistProfile(therapist);
        
        if (therapist) {
          const data = await bookingService.getBookingsByTherapist(therapist.id);
          setBookings(data)
        } else {
          setError('No therapist profile found mapped to your account. Please contact support.')
        }
      }

    } catch (err) {
      console.error("Fetch data error:", err)
      setError(getErrorMessage(err, "An unexpected error occurred while fetching data."))
    } finally {
      setLoading(false)
    }
  }, [currentUser?.role, currentUser?.uid]);

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  // Escape key handler for decline modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && declineBookingDoc && !isDeclining) {
        setDeclineBookingDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [declineBookingDoc, isDeclining]);

  const handleUpdateStatus = async (id: string, status: BookingStatus) => {
    try {
      setProcessingId(id)
      await bookingService.updateStatus(id, status);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    } catch (err) {
      console.error("Update status error:", err)
      setError(getErrorMessage(err, "Something went wrong while updating the booking status."))
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeclineConfirm = async () => {
    if (!declineBookingDoc || !currentUser?.uid) return;
    try {
      setIsDeclining(true);
      await bookingService.declineBooking(declineBookingDoc.id, currentUser.uid, declineReason, declineNote);
      setBookings(prev => prev.map(b => b.id === declineBookingDoc.id ? { ...b, status: 'rejected' as BookingStatus } : b))
      setDeclineBookingDoc(null);
      setDeclineReason("Therapist unavailable");
      setDeclineNote("");
    } catch (err) {
      console.error("Decline status error:", err)
      setError(getErrorMessage(err, "Failed to decline booking."))
    } finally {
      setIsDeclining(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate.push('/');
  }

  const scheduleBuilderNode = (
    <div className="w-full">
      {currentUser?.role === 'admin' && (
        <div className="mb-8 text-left">
          <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-accent tracking-widest opacity-60 mb-2">
            Select Therapist to edit schedule
          </label>
          <div className="relative w-full max-w-sm">
            <select 
              value={adminSelectedTherapistId}
              onChange={(e) => setAdminSelectedTherapistId(e.target.value)}
              className="block w-full h-14 rounded-2xl bg-[#FCFAF7] border border-primary/5 px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer appearance-none outline-none font-sans"
            >
              {allTherapists.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40 pointer-events-none" />
          </div>
        </div>
      )}
      <ScheduleBuilder therapistId={currentUser?.role === 'admin' ? adminSelectedTherapistId : (myTherapistProfile?.id || "")} />
    </div>
  );

  const adminTherapistsNode = currentUser?.role === 'admin' ? (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-primary font-serif">Manage Therapists</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active status controls whether a practitioner is listed and bookable by clients.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {allTherapists.map(t => (
          <div
            key={t.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-xl border border-hairline gap-4 shadow-sm text-left"
          >
            <div className="flex items-center gap-3.5">
              {t.image ? (
                <img
                  src={t.image}
                  alt={t.name}
                  className="w-12 h-12 rounded-lg object-cover border border-hairline shadow-xs"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-12 h-12 bg-neutral-surface rounded-lg border border-hairline flex items-center justify-center text-primary/40">
                  <User className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="font-semibold text-sm text-primary font-serif">{t.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.specialization}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium border",
                  t.active
                    ? "bg-success-surface text-success border-success/30"
                    : "bg-danger-surface text-danger border-danger/30"
                )}
              >
                {t.active ? "Active" : "Inactive"}
              </span>
              <Button
                variant={t.active ? "outline" : "primary"}
                size="sm"
                disabled={processingTherapistId === t.id}
                onClick={async () => {
                  try {
                    setProcessingTherapistId(t.id);
                    await therapistService.updateTherapistStatus(t.id, !t.active);
                    setAllTherapists(prev =>
                      prev.map(item => (item.id === t.id ? { ...item, active: !item.active } : item))
                    );
                  } catch (e) {
                    console.error("Update therapist status error:", e);
                    setError(getErrorMessage(e, "Failed to update therapist status."));
                  } finally {
                    setProcessingTherapistId(null);
                  }
                }}
              >
                {processingTherapistId === t.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : null}
                {t.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <TherapistDashboard 
        therapist={myTherapistProfile}
        bookings={bookings}
        loading={loading}
        error={error}
        onRefresh={fetchData}
        onLogout={handleLogout}
        onUpdateStatus={handleUpdateStatus}
        onDeclineRequest={setDeclineBookingDoc}
        processingId={processingId}
        scheduleBuilderNode={scheduleBuilderNode}
        adminTherapistsNode={adminTherapistsNode}
        contactsNode={currentUser?.role === 'admin' ? <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><ContactsPanel /></div> : null}
        emailLogsNode={currentUser?.role === 'admin' ? <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><EmailLogsPanel /></div> : null}
        isAdmin={currentUser?.role === 'admin'}
      />

      <AnimatePresence>
        {declineBookingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-primary/20 backdrop-blur-xs"
              onClick={() => !isDeclining && setDeclineBookingDoc(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-hairline overflow-hidden font-sans"
            >
              <div className="p-5 md:p-6">
                <div className="flex items-start gap-3.5 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-danger-surface text-danger flex items-center justify-center shrink-0 border border-danger/20">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-base font-semibold text-primary font-serif">Decline Session Request</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      For <span className="font-medium text-primary">{declineBookingDoc.name}</span> on{" "}
                      {declineBookingDoc.date ? format(parseISO(declineBookingDoc.date), "MMM d") : ""}{" "}
                      at <span className="tabular">{declineBookingDoc.time}</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-1.5">
                      Reason
                    </label>
                    <div className="relative group text-left">
                      <select
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        disabled={isDeclining}
                        className="w-full h-9 rounded-lg bg-neutral-surface/40 border border-hairline px-3 pr-8 text-xs font-medium text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary appearance-none transition-colors cursor-pointer"
                      >
                        <option value="Therapist unavailable">Therapist unavailable</option>
                        <option value="Requested slot unavailable">Requested slot unavailable</option>
                        <option value="Unable to match requirements">Unable to match requirements</option>
                        <option value="Service currently unavailable">Service currently unavailable</option>
                        <option value="Duplicate booking detected">Duplicate booking detected</option>
                        <option value="Other">Other</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/60 mb-1.5">
                      Custom Note to Client (Optional)
                    </label>
                    <textarea
                      value={declineNote}
                      onChange={(e) => setDeclineNote(e.target.value)}
                      disabled={isDeclining}
                      placeholder="Add a polite explanation to be included in the email..."
                      className="w-full h-20 rounded-lg bg-neutral-surface/40 border border-hairline p-3 text-xs font-normal text-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors resize-none placeholder:text-muted-foreground text-left"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-hairline">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeclining}
                    onClick={() => setDeclineBookingDoc(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isDeclining}
                    onClick={handleDeclineConfirm}
                  >
                    {isDeclining ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    Confirm Decline
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
