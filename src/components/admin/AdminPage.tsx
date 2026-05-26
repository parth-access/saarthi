"use client";

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { therapistService } from '@/services/therapistService';
import { 
  User, 
  CheckCircle2, 
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

export const AdminPage = () => {
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [processingId, setProcessingId] = React.useState<string | null>(null)
  
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
        if (ths.length > 0 && !adminSelectedTherapistId) {
          setAdminSelectedTherapistId(ths[0].id);
        }

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
      setError(err instanceof Error ? (err instanceof Error ? err.message : String(err)) : "An unexpected error occurred while fetching data.")
    } finally {
      setLoading(false)
    }
  }, [adminSelectedTherapistId, currentUser?.role, currentUser?.uid]);

  React.useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleUpdateStatus = async (id: string, status: BookingStatus) => {
    try {
      setProcessingId(id)
      await bookingService.updateStatus(id, status);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    } catch (err) {
      console.error("Update status error:", err)
      setError(err instanceof Error ? (err instanceof Error ? err.message : String(err)) : "Something went wrong while updating the booking status.")
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
      setError(err instanceof Error ? (err instanceof Error ? err.message : String(err)) : "Failed to decline booking.")
    } finally {
      setIsDeclining(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate.push('/');
  }

  const filteredBookings = bookings;

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
      <h2 className="text-3xl font-serif text-primary tracking-tight mb-8">Manage Therapists</h2>
      {allTherapists.map(t => (
        <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-[#FCFAF7] rounded-3xl border border-primary/5 gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_15px_40px_rgba(0,0,0,0.05)] text-left">
          <div className="flex items-center gap-4">
            {t.image ? (
              <img src={t.image} alt={t.name} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-primary/5 shadow-sm" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center text-primary/40"><User className="w-6 h-6" /></div>
            )}
            <div>
              <div className="font-bold text-lg text-primary font-serif">{t.name}</div>
              <div className="text-sm text-primary/60 mt-0.5">{t.specialization}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border", t.active ? "bg-green-50 text-green-600 border-green-100" : "bg-red-50 text-red-600 border-red-100")}>
              {t.active ? "Active" : "Inactive"}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              className="rounded-xl h-10 px-5 border-primary/10 hover:bg-primary hover:text-white transition-all font-bold tracking-wide cursor-pointer"
              onClick={async () => {
                try {
                  setLoading(true);
                  await therapistService.updateTherapistStatus(t.id, !t.active);
                  await fetchData();
                } catch (e) {
                  console.error(e);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {t.active ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <>
      <TherapistDashboard 
        therapist={myTherapistProfile}
        bookings={currentUser?.role === 'admin' ? filteredBookings : bookings}
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
        isAdmin={currentUser?.role === 'admin'}
      />

      <AnimatePresence>
        {declineBookingDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-primary/20 backdrop-blur-sm"
              onClick={() => !isDeclining && setDeclineBookingDoc(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-primary/10 overflow-hidden"
            >
              <div className="p-6 md:p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0 animate-pulse">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl font-serif text-primary">Decline Booking</h3>
                    <p className="text-sm text-primary/60 mt-1 font-sans">
                      For {declineBookingDoc.name}&apos;s session on {declineBookingDoc.date ? format(parseISO(declineBookingDoc.date), "MMM d") : ""} at {declineBookingDoc.time}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-primary/40 mb-2 font-sans">Reason</label>
                    <div className="relative group text-left">
                      <select
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        disabled={isDeclining}
                        className="w-full h-12 rounded-xl bg-[#FCFAF7] border border-primary/5 px-4 pr-10 text-sm font-medium text-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all outline-none cursor-pointer font-sans"
                      >
                        <option value="Therapist unavailable">Therapist unavailable</option>
                        <option value="Requested slot unavailable">Requested slot unavailable</option>
                        <option value="Unable to match requirements">Unable to match requirements</option>
                        <option value="Service currently unavailable">Service currently unavailable</option>
                        <option value="Duplicate booking detected">Duplicate booking detected</option>
                        <option value="Other">Other</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-primary/40 mb-2 font-sans">Custom Note (Optional)</label>
                    <textarea
                      value={declineNote}
                      onChange={(e) => setDeclineNote(e.target.value)}
                      disabled={isDeclining}
                      placeholder="Add a polite note to be included in the email..."
                      className="w-full h-24 rounded-xl bg-[#FCFAF7] border border-primary/5 p-4 text-sm font-medium text-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none resize-none placeholder:font-normal placeholder:text-primary/30 font-sans text-left"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-8 font-sans">
                  <button
                    disabled={isDeclining}
                    onClick={() => setDeclineBookingDoc(null)}
                    className="px-6 h-12 rounded-xl text-sm font-bold text-primary/60 hover:text-primary hover:bg-primary/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isDeclining}
                    onClick={handleDeclineConfirm}
                    className="px-6 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold tracking-wide transition-all shadow-lg shadow-red-500/20 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:hover:transform-none cursor-pointer"
                  >
                    {isDeclining ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirm Decline
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

