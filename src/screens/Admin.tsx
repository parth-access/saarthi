"use client";

import * as React from "react"
// import { Helmet } from "react-helmet-async"
import { motion, AnimatePresence } from "motion/react"
import { therapistService } from '../services/therapistService';
import { 
  Mail, 
  Calendar, 
  User, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Filter, 
  Info, 
  ChevronDown,
  Trash2,
  Check,
  RefreshCw,
  LogOut,
  Clock,
  Timer,
  LayoutGrid,
  Plus,
  Trash,
  CheckCircle
} from "lucide-react"
import { useRouter as useNavigate } from "next/navigation"
import { format, parseISO } from "date-fns"
import { Button } from "../components/ui/Button"
import { cn } from "../lib/utils"
import { BookingStatus, Booking, Therapist } from "../types"
import { bookingService } from "../services/bookingService"
import { useAuth } from "../contexts/AuthContext"
import { useTherapists } from "../hooks/useTherapists"
import { TherapistDashboard } from "../components/dashboard/TherapistDashboard"
import { ContactsPanel } from "../components/admin/ContactsPanel"

const AdminPage = () => {
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const { therapists } = useTherapists();
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [processingId, setProcessingId] = React.useState<string | null>(null)
  
  // Tab/Filter states
  const [activeTab, setActiveTab] = React.useState<'bookings' | 'availability'>('bookings')
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | 'all'>('all')
  const [dateFilter, setDateFilter] = React.useState("")
  const [therapistFilter, setTherapistFilter] = React.useState<string>('all')

  // Availability states
  const [availDay, setAvailDay] = React.useState(1)
  const [availStart, setAvailStart] = React.useState("09:00")
  const [availEnd, setAvailEnd] = React.useState("17:00")
  const [availDuration, setAvailDuration] = React.useState(60)
  const [myRules, setMyRules] = React.useState<any[]>([])
  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'success'>('idle')
  const { currentUser } = useAuth()
  const [myTherapistProfile, setMyTherapistProfile] = React.useState<Therapist | null>(null)

  const navigate = useNavigate()
  const { logout } = useAuth()

  // Global Admin States
  const [allTherapists, setAllTherapists] = React.useState<Therapist[]>([])
  const [adminSelectedTherapistId, setAdminSelectedTherapistId] = React.useState<string>("")

  // Decline states
  const [declineBookingDoc, setDeclineBookingDoc] = React.useState<Booking | null>(null)
  const [declineReason, setDeclineReason] = React.useState("Therapist unavailable")
  const [declineNote, setDeclineNote] = React.useState("")
  const [isDeclining, setIsDeclining] = React.useState(false)

  const fetchData = async () => {
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
        
        if (adminSelectedTherapistId || ths.length > 0) {
          const rules = await therapistService.getAvailabilityRules(adminSelectedTherapistId || ths[0].id);
          setMyRules(rules);
        }
      } else {
        // Therapist Logic
        const therapist = await therapistService.getTherapistByAuthId(currentUser.uid);
        setMyTherapistProfile(therapist);
        
        if (therapist) {
          const data = await bookingService.getBookingsByTherapist(therapist.id);
          setBookings(data)
          
          const rules = await therapistService.getAvailabilityRules(therapist.id);
          setMyRules(rules);
        } else {
          setError('No therapist profile found mapped to your account. Please contact support.')
        }
      }

    } catch (err: any) {
      console.error("Fetch data error:", err)
      setError(err.message || "An unexpected error occurred while fetching data.")
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    fetchData()
  }, [navigate, currentUser?.uid, currentUser?.role, adminSelectedTherapistId])

  const handleUpdateStatus = async (id: string, status: BookingStatus) => {
    try {
      setProcessingId(id)
      await bookingService.updateStatus(id, status);
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
    } catch (err: any) {
      console.error("Update status error:", err)
      setError(err?.message || "Something went wrong while updating the booking status.")
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
    } catch (err: any) {
      console.error("Decline status error:", err)
      setError(err?.message || "Failed to decline booking.")
    } finally {
      setIsDeclining(false);
    }
  }

  const handleSaveAvailability = async () => {
    const targetTherapistId = currentUser?.role === 'admin' ? adminSelectedTherapistId : myTherapistProfile?.id;
    if (!availStart || !availEnd || !targetTherapistId) return;
    try {
      setLoading(true);
      setSaveStatus('saving');
      await therapistService.addAvailabilityRule({
        therapistId: targetTherapistId,
        dayOfWeek: availDay,
        startTime: availStart,
        endTime: availEnd,
        slotDuration: availDuration
      });
      await fetchData();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err.message || "Failed to save availability rule");
      setSaveStatus('idle');
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteAvailability = async (id: string) => {
    if (!currentUser?.uid) return;
    try {
      setLoading(true);
      await therapistService.deleteAvailabilityRule(id);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to delete availability rule");
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = () => {
    logout();
    navigate.push('/'); // Redirect to home
  }

  const previewSlots = React.useMemo(() => {
    const slots = [];
    try {
      const [startH, startM] = availStart.split(':').map(Number);
      const [endH, endM] = availEnd.split(':').map(Number);
      
      let currentMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      while (currentMin + availDuration <= endMin) {
        const h = Math.floor(currentMin / 60);
        const m = currentMin % 60;
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        currentMin += availDuration;
      }
    } catch {
       // Ignore parsing errors
    }
    return slots;
  }, [availStart, availEnd, availDuration]);

  const filteredBookings = bookings.filter(b => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesDate = !dateFilter || b.date === dateFilter;
    const matchesTherapist = therapistFilter === 'all' || b.therapistId === therapistFilter;
    return matchesStatus && matchesDate && matchesTherapist;
  })

  const getTherapistName = (id: string) => {
    const th = allTherapists.find(t => t.id === id);
    return th?.name || "Unknown Therapist";
  };

  const scheduleBuilderNode = (
    <div className="flex flex-col lg:flex-row gap-8 items-start">
      
      {/* LEFT: RULE BUILDER */}
      <div className="flex-1 lg:flex-[0.4] bg-white p-8 md:p-12 rounded-[3.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-primary/5 w-full sticky top-32">
        <h2 className="text-3xl font-serif text-primary tracking-tight mb-8">Schedule Builder</h2>
        
        <div className="space-y-8">
          {currentUser?.role === 'admin' && (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-accent tracking-widest opacity-60">
                <User className="w-3 h-3" /> Select Therapist
              </label>
              <div className="relative group">
                <select 
                  value={adminSelectedTherapistId}
                  onChange={(e) => setAdminSelectedTherapistId(e.target.value)}
                  className="block w-full h-14 rounded-2xl bg-[#FCFAF7] border border-primary/5 px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer appearance-none group-Hover:border-primary/10"
                >
                  {allTherapists.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30 pointer-events-none group-hover:text-primary/60 transition-colors" />
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-accent tracking-widest opacity-60">
              <Calendar className="w-3 h-3" /> Day of Week
            </label>
            <div className="relative group">
              <select 
                value={availDay}
                onChange={(e) => setAvailDay(Number(e.target.value))}
                className="block w-full h-14 rounded-2xl bg-[#FCFAF7] border border-primary/5 px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer appearance-none group-hover:border-primary/10"
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30 pointer-events-none group-hover:text-primary/60 transition-colors" />
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-accent tracking-widest opacity-60">
              <Clock className="w-3 h-3" /> Time Range
            </label>
            <div className="flex gap-4">
              <div className="flex-1 relative group">
                <input 
                  type="time"
                  value={availStart}
                  onChange={(e) => setAvailStart(e.target.value)}
                  className="block w-full h-14 rounded-2xl bg-[#FCFAF7] border border-primary/5 px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer group-hover:border-primary/10"
                />
              </div>
              <div className="flex items-center text-primary/20 font-bold">-</div>
              <div className="flex-1 relative group">
                <input 
                  type="time"
                  value={availEnd}
                  onChange={(e) => setAvailEnd(e.target.value)}
                  className="block w-full h-14 rounded-2xl bg-[#FCFAF7] border border-primary/5 px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer group-hover:border-primary/10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-accent tracking-widest opacity-60">
              <Timer className="w-3 h-3" /> Slot Duration
            </label>
            <div className="relative group">
              <select 
                value={availDuration}
                onChange={(e) => setAvailDuration(Number(e.target.value))}
                className="block w-full h-14 rounded-2xl bg-[#FCFAF7] border border-primary/5 px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-accent/20 transition-all cursor-pointer appearance-none group-hover:border-primary/10"
              >
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={90}>90 Minutes</option>
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30 pointer-events-none group-hover:text-primary/60 transition-colors" />
            </div>
          </div>

          <Button 
            onClick={handleSaveAvailability} 
            disabled={saveStatus === 'saving' || !availStart || !availEnd}
            className={cn(
              "w-full h-14 rounded-2xl text-sm mt-4 font-bold tracking-wide transition-all duration-300",
              saveStatus === 'success' 
                ? "bg-green-500 hover:bg-green-600 shadow-green-500/20 shadow-lg" 
                : "bg-primary hover:bg-primary/90 shadow-primary/20 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            )}
          >
            {saveStatus === 'saving' ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving...</span>
            ) : saveStatus === 'success' ? (
              <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Rule Saved</span>
            ) : (
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Rule</span>
            )}
          </Button>
        </div>
      </div>

      {/* RIGHT: PREVIEW & ACTIVE RULES */}
      <div className="flex-1 lg:flex-[0.6] flex flex-col gap-8 w-full">
        
        {/* REAL-TIME PREVIEW */}
        <div className="bg-[#FCFAF7] p-8 md:p-12 rounded-[3.5rem] border border-primary/5 shadow-inner">
           <h3 className="font-serif text-2xl tracking-tight text-primary mb-6 flex flex-wrap items-center justify-between gap-4">
             <div className="flex items-center gap-3">
               <LayoutGrid className="w-5 h-5 text-accent" /> Layout Preview
             </div>
             <span className="text-[10px] uppercase font-bold tracking-widest text-primary/40 bg-white px-4 py-1.5 rounded-full border border-primary/5 shadow-sm">
               {previewSlots.length} slots generated
             </span>
           </h3>
           
           {previewSlots.length > 0 ? (
             <div className="flex flex-wrap gap-2 md:gap-3">
               {previewSlots.map((slot, i) => (
                 <motion.div 
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ delay: i * 0.02 }}
                   key={slot}
                   className="px-4 py-2.5 bg-white rounded-xl border border-primary/5 text-sm font-bold text-primary shadow-sm hover:border-accent/30 hover:text-accent hover:-translate-y-0.5 transition-all cursor-default"
                 >
                   {slot}
                 </motion.div>
               ))}
             </div>
           ) : (
             <div className="text-center py-12 px-4 border-2 border-dashed border-primary/10 rounded-3xl bg-white/50">
               <Calendar className="w-8 h-8 text-primary/10 mx-auto mb-3" />
               <p className="text-primary/40 text-sm font-medium">No valid time range selected.</p>
             </div>
           )}
        </div>

        {/* ACTIVE RULES */}
        <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-primary/5 shadow-sm">
          <h3 className="font-serif text-2xl tracking-tight text-primary mb-8 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-accent" /> Active Schedule Rules
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {myRules.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="col-span-1 sm:col-span-2 text-center py-16 bg-[#FAFAFA] rounded-3xl border-2 border-dashed border-primary/5"
                >
                  <Calendar className="w-10 h-10 text-primary/10 mx-auto mb-4" />
                  <p className="text-primary/40 font-medium">No rules have been created yet.</p>
                  <p className="text-xs text-primary/30 mt-1">Add a rule from the builder to get started.</p>
                </motion.div>
              ) : (
                myRules.map((rule: any) => {
                  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                  return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={rule.id} 
                    className="group bg-[#FAFAFA] hover:bg-white p-6 rounded-3xl border border-primary/5 hover:border-accent/20 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300 flex flex-col relative overflow-hidden"
                  >
                    {/* Accent line */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent/0 via-accent/40 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="flex items-start justify-between mb-4">
                      <div className="bg-accent/10 text-accent font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-widest border border-accent/10">
                        {days[rule.dayOfWeek]}
                      </div>
                      <button 
                        onClick={() => handleDeleteAvailability(rule.id)}
                        className="w-8 h-8 rounded-full bg-white border border-primary/5 flex items-center justify-center text-primary/20 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-colors shadow-sm"
                        title="Delete Rule"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <div className="mt-auto">
                      <div className="text-2xl font-serif text-primary tracking-tight mb-1 flex items-center gap-2">
                        {rule.startTime} <span className="text-primary/20 text-lg font-sans">-</span> {rule.endTime}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary/40">
                        <Timer className="w-3 h-3 opacity-60" /> {rule.slotDuration} min sessions
                      </div>
                    </div>
                  </motion.div>
                )})
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );

  const adminTherapistsNode = currentUser?.role === 'admin' ? (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-serif text-primary tracking-tight mb-8">Manage Therapists</h2>
      {allTherapists.map(t => (
        <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-[#FCFAF7] rounded-3xl border border-primary/5 gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.02)] transition-all hover:shadow-[0_15px_40px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-4">
            {t.image ? (
              <img src={t.image} alt={t.name} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-primary/5" />
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
              className="rounded-xl h-10 px-5 border-primary/10 hover:bg-primary hover:text-white transition-all font-bold tracking-wide"
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
      {/* Helmet removed */}
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
                  <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-serif text-primary">Decline Booking</h3>
                    <p className="text-sm text-primary/60 mt-1">
                      For {declineBookingDoc.name}'s session on {declineBookingDoc.date ? format(parseISO(declineBookingDoc.date), "MMM d") : ""} at {declineBookingDoc.time}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-primary/40 mb-2">Reason</label>
                    <div className="relative group">
                      <select
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        disabled={isDeclining}
                        className="w-full h-12 rounded-xl bg-[#FCFAF7] border border-primary/5 px-4 pr-10 text-sm font-medium text-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all outline-none"
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
                    <label className="block text-xs font-bold uppercase tracking-widest text-primary/40 mb-2">Custom Note (Optional)</label>
                    <textarea
                      value={declineNote}
                      onChange={(e) => setDeclineNote(e.target.value)}
                      disabled={isDeclining}
                      placeholder="Add a polite note to be included in the email..."
                      className="w-full h-24 rounded-xl bg-[#FCFAF7] border border-primary/5 p-4 text-sm font-medium text-primary focus:ring-2 focus:ring-primary/10 transition-all outline-none resize-none placeholder:font-normal placeholder:text-primary/30"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-8">
                  <button
                    disabled={isDeclining}
                    onClick={() => setDeclineBookingDoc(null)}
                    className="px-6 h-12 rounded-xl text-sm font-bold text-primary/60 hover:text-primary hover:bg-primary/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={isDeclining}
                    onClick={handleDeclineConfirm}
                    className="px-6 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold tracking-wide transition-all shadow-lg shadow-red-500/20 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-50 disabled:hover:transform-none"
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

const StatusBadge = ({ status }: { status: BookingStatus }) => {
  const styles: Record<BookingStatus, string> = {
    pending: "bg-amber-50 text-amber-600 border-amber-100",
    pending_approval: "bg-blue-50 text-blue-600 border-blue-100",
    awaiting_payment: "bg-indigo-50 text-indigo-600 border-indigo-100",
    confirmed: "bg-green-50 text-green-600 border-green-100",
    rejected: "bg-red-50 text-red-600 border-red-100",
    completed: "bg-primary/5 text-primary border-primary/10",
    cancelled: "bg-slate-50 text-slate-500 border-slate-100"
  }

  const icons: Record<BookingStatus, React.ReactNode> = {
    pending: <Loader2 className="w-3 h-3 animate-pulse" />,
    pending_approval: <Loader2 className="w-3 h-3 animate-pulse" />,
    awaiting_payment: <Loader2 className="w-3 h-3 flex-shrink-0" />,
    confirmed: <CheckCircle2 className="w-3 h-3" />,
    rejected: <XCircle className="w-3 h-3" />,
    completed: <CheckCircle2 className="w-3 h-3" />,
    cancelled: <Trash2 className="w-3 h-3" />
  }

  return (
    <span className={cn(
      "px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border shadow-sm flex items-center gap-2", 
      styles[status]
    )}>
      {icons[status]}
      {status}
    </span>
  )
}

export default AdminPage
