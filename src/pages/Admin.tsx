import * as React from "react"
import { Helmet } from "react-helmet-async"
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
  LogOut
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { Button } from "../components/ui/Button"
import { cn } from "../lib/utils"
import { BookingStatus, Booking, Therapist } from "../types"
import { bookingService } from "../services/bookingService"
import { useAuth } from "../contexts/AuthContext"
import { useTherapists } from "../hooks/useTherapists"

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
  
  // Availability states
  const [availDay, setAvailDay] = React.useState(1)
  const [availStart, setAvailStart] = React.useState("09:00")
  const [availEnd, setAvailEnd] = React.useState("17:00")
  const [availDuration, setAvailDuration] = React.useState(60)
  const [myRules, setMyRules] = React.useState<any[]>([])
  const { currentUser } = useAuth()
  const [myTherapistProfile, setMyTherapistProfile] = React.useState<Therapist | null>(null)

  const navigate = useNavigate()
  const { logout } = useAuth()

  const fetchData = async () => {
    try {
      setLoading(true)
      setError("")
      
      if (!currentUser?.uid) return;
      
      // Fetch therapist profile for this admin
      const therapist = await therapistService.getTherapistByAuthId(currentUser.uid);
      setMyTherapistProfile(therapist);
      
      if (therapist) {
        // Fetch only bookings for this therapist
        const data = await bookingService.getBookingsByTherapist(therapist.id);
        setBookings(data)
        
        // Fetch availability rules for this therapist
        const rules = await therapistService.getAvailabilityRules(therapist.id);
        setMyRules(rules);
      } else {
        setError('No therapist profile found mapped to your account. Please contact support.')
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
  }, [navigate, currentUser?.uid])

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

  const handleSaveAvailability = async () => {
    if (!availStart || !availEnd || !myTherapistProfile?.id) return;
    try {
      setLoading(true);
      await therapistService.addAvailabilityRule({
        therapistId: myTherapistProfile.id,
        dayOfWeek: availDay,
        startTime: availStart,
        endTime: availEnd,
        slotDuration: availDuration
      });
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to save availability rule");
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteAvailability = async (id: string) => {
    if (!myTherapistProfile?.id) return;
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
    navigate('/');
  }

  const filteredBookings = bookings.filter(b => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesDate = !dateFilter || b.date === dateFilter;
    return matchesStatus && matchesDate;
  })

  const getTherapistName = (id: string) => {
    const th = therapists.find(t => t.id === id);
    return th?.name || "Unknown Therapist";
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-[#FDFCFB] selection:bg-primary/10">
      <Helmet>
        <title>Session Manager | Saarthi Admin</title>
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-serif text-primary tracking-tight mb-4">Session Manager</h1>
            <p className="text-muted-foreground font-sans text-lg max-w-lg leading-relaxed italic">
              A gentle space to manage your connections and provide clarity to those seeking support.
            </p>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-wrap gap-4"
          >
            <Button 
              variant="outline" 
              className="rounded-2xl bg-white px-8 h-14 border-primary/10 hover:border-primary/30 transition-all font-medium" 
              onClick={fetchData}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Sync Database
            </Button>
            <Button 
              variant="outline" 
              className="rounded-2xl bg-red-50 text-red-600 px-8 h-14 border-red-100 hover:bg-red-100 transition-all font-medium" 
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </motion.div>
        </header>

        <div className="flex gap-4 mb-10 border-b border-primary/10 pb-2">
           <button 
             onClick={() => setActiveTab('bookings')}
             className={cn("px-6 py-3 rounded-t-2xl font-bold transition-all", activeTab === 'bookings' ? "bg-primary text-white" : "text-primary hover:bg-primary/5")}
           >
             Bookings
           </button>
           <button 
             onClick={() => setActiveTab('availability')}
             className={cn("px-6 py-3 rounded-t-2xl font-bold transition-all", activeTab === 'availability' ? "bg-primary text-white" : "text-primary hover:bg-primary/5")}
           >
             Availability
           </button>
        </div>

        {activeTab === 'bookings' ? (
        <>
        {/* 🛠 FILTER BAR */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="bg-white border border-primary/5 rounded-[2.5rem] p-10 mb-16 shadow-[0_8px_30px_rgb(0,0,0,0.02)]"
        >
          <div className="flex flex-col lg:flex-row lg:items-center gap-10">
            <div className="flex items-center gap-4 text-xs font-bold text-primary/30 uppercase tracking-[0.3em]">
              <Filter className="w-4 h-4" /> Filter By
            </div>
            
            <div className="flex-1 flex flex-wrap gap-8">
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-accent tracking-widest ml-1 opacity-60">Status</label>
                <div className="relative group">
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="block w-52 h-14 rounded-2xl bg-[#FAFAFA] border-none px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer"
                  >
                    <option value="all">All Request Status</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="confirmed">✔ Confirmed</option>
                    <option value="rejected">✖ Rejected</option>
                    <option value="completed">✨ Completed</option>
                    <option value="cancelled">🚫 Cancelled</option>
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/20 pointer-events-none transition-transform group-hover:translate-y-[-40%]" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-accent tracking-widest ml-1 opacity-60">Session Date</label>
                <input 
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="block h-14 rounded-2xl bg-[#FAFAFA] border-none px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                />
              </div>
            </div>

            <div className="text-sm font-medium text-muted-foreground bg-primary/5 px-6 py-3 rounded-2xl border border-primary/5 italic">
              Showing <span className="text-primary font-bold not-italic">{filteredBookings?.length || 0}</span> sessions
            </div>
          </div>
        </motion.div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12 p-6 bg-red-50 text-red-700 rounded-3xl border border-red-100 flex items-center gap-4 shadow-sm"
          >
             <div className="bg-red-100 p-2 rounded-xl">
               <Info className="w-5 h-5" />
             </div>
             <div className="flex-1 font-medium">{error}</div>
             <Button variant="ghost" size="sm" onClick={fetchData} className="text-red-700 hover:bg-red-100">Retry</Button>
          </motion.div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-48 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin mb-8 text-primary/20" />
            <p className="font-serif text-2xl italic text-primary/30 tracking-tight">Gathering session data...</p>
          </div>
        ) : (filteredBookings?.length || 0) === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-32 bg-white rounded-[4rem] border-2 border-dashed border-primary/5"
          >
            <div className="bg-primary/5 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8">
              <Calendar className="w-12 h-12 text-primary/10" />
            </div>
            <p className="text-4xl font-serif text-primary/30 mb-4 tracking-tight italic">No sessions yet</p>
            <p className="text-muted-foreground max-w-xs mx-auto text-lg leading-relaxed">
              Your schedule is currently clear. Take this moment for yourself.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-10">
            <AnimatePresence mode="popLayout">
              {filteredBookings?.map((booking) => (
                <motion.div
                  key={booking.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  whileHover={{ scale: 1.005 }}
                  className="bg-white p-1 md:p-1 rounded-[3.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-primary/5 overflow-hidden group transition-all duration-500"
                >
                  <div className="flex flex-col xl:flex-row">
                    {/* LEFT PANEL: CONTENT */}
                    <div className="flex-1 p-10 md:p-14">
                      <div className="flex flex-wrap items-start justify-between gap-10 mb-12">
                        <div className="space-y-6">
                          <div className="flex flex-wrap items-center gap-6">
                            <h2 className="text-4xl md:text-5xl font-serif text-primary tracking-tight leading-none">{booking.name}</h2>
                            <StatusBadge status={booking.status} />
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-10 gap-y-5 text-muted-foreground text-sm font-medium">
                            <span className="flex items-center gap-3 bg-primary/5 px-5 py-2 rounded-2xl text-primary/80">
                              <Mail className="h-4 w-4 text-primary/40" /> {booking.email}
                            </span>
                            <span className="flex items-center gap-3 bg-accent/5 px-5 py-2 rounded-2xl text-accent/80 font-bold uppercase tracking-widest text-[10px]">
                              <User className="h-4 w-4" /> {booking.gender}, {booking.age} yrs
                            </span>
                            <span className="flex items-center gap-3 italic text-primary/60">
                              <ShieldCheck className="h-4 w-4 text-accent/40" /> {getTherapistName(booking.therapistId)}
                            </span>
                          </div>
                        </div>

                        {/* SLOT DISPLAY */}
                        <div className="bg-[#FCFAF7] p-8 rounded-[3rem] border border-primary/5 text-center min-w-[200px] shadow-inner">
                          <div className="inline-flex items-center gap-2 text-[10px] font-bold text-primary/20 uppercase tracking-[0.3em] mb-3">
                            <Calendar className="w-3 h-3" /> Session Slot
                          </div>
                          <div className="text-4xl font-serif font-bold text-primary mb-1">
                            {booking.date ? (
                              (() => {
                                try {
                                  return format(parseISO(booking.date), "dd MMM")
                                } catch (e) {
                                  return "Invalid"
                                }
                              })()
                            ) : "N/A"}
                          </div>
                          <div className="text-sm font-bold text-accent uppercase tracking-widest mt-2 border-t border-primary/5 pt-2">
                             {booking.time}
                          </div>
                        </div>
                      </div>

                      {/* NOTES SECTION */}
                      <div className="relative mb-12">
                         <div className="absolute left-[-2rem] top-0 bottom-0 w-[4px] bg-accent/10 rounded-full" />
                         <p className="text-muted-foreground leading-relaxed italic text-2xl text-primary/70 font-serif">
                            "{booking.message || 'The seeker left no additional notes.'}"
                         </p>
                      </div>

                      <div className="flex items-center justify-between pt-10 border-t border-primary/5">
                        <div className="flex items-center gap-4">
                           <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-primary/20">Session Type:</span>
                           <span className="px-4 py-1 rounded-full bg-primary/5 text-xs font-bold text-primary/60 uppercase tracking-tighter">
                             {booking.sessionType}
                           </span>
                        </div>
                        <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/30">
                          ID: {booking.id.substring(0, 8).toUpperCase()} • RECEIVED {(() => {
                            try {
                              const dateVal = booking.createdAt?.seconds 
                                ? new Date(booking.createdAt.seconds * 1000) 
                                : booking.createdAt;
                              return dateVal ? format(new Date(dateVal), "MMM dd, p") : "DATE_MISSING";
                            } catch (e) { return "N/A" }
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT PANEL: ACTIONS / STATUS */}
                    <div className="xl:w-80 bg-[#FAFAFA] border-l border-primary/5 flex flex-col p-10 justify-center">
                      <div className="flex flex-col gap-6">
                        {booking.status === 'pending' ? (
                          <>
                            <button
                              disabled={!!processingId}
                              onClick={() => handleUpdateStatus(booking.id, 'confirmed')}
                              className="w-full h-20 flex flex-col items-center justify-center gap-1 bg-primary text-white rounded-[2rem] hover:bg-primary/95 transition-all font-bold shadow-2xl shadow-primary/20 disabled:opacity-50 active:scale-95 group"
                            >
                              {processingId === booking.id ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span>Accept Session</span>
                                  </div>
                                  <span className="text-[10px] font-normal opacity-60">Notify Seeker</span>
                                </>
                              )}
                            </button>
                            <button
                              disabled={!!processingId}
                              onClick={() => handleUpdateStatus(booking.id, 'rejected')}
                              className="w-full h-16 flex items-center justify-center gap-3 bg-white text-red-500 rounded-[1.5rem] hover:bg-red-50 transition-all font-bold disabled:opacity-50 border-2 border-red-100/50"
                            >
                              {processingId === booking.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
                              Decline
                            </button>
                          </>
                        ) : booking.status === 'confirmed' ? (
                          <div className="space-y-6">
                            <div className="p-10 rounded-[3rem] border-2 border-dashed border-green-200 bg-green-50/50 flex flex-col items-center justify-center text-green-700 text-center">
                               <div className="bg-green-100 p-4 rounded-full mb-4">
                                 <CheckCircle2 className="w-8 h-8" />
                               </div>
                               <span className="font-black uppercase tracking-[0.2em] text-[10px] mb-1">Confirmed</span>
                               <span className="text-xs opacity-60">Seeking clarity soon.</span>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                              <button 
                                disabled={!!processingId}
                                onClick={() => handleUpdateStatus(booking.id, 'completed')}
                                className="h-16 bg-primary text-white rounded-2xl hover:brightness-110 transition-all font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                              >
                                <Check className="w-4 h-4" /> Mark Completed
                              </button>
                              <button 
                                disabled={!!processingId}
                                onClick={() => handleUpdateStatus(booking.id, 'cancelled')}
                                className="h-14 bg-white border-2 border-red-50 text-red-400 rounded-2xl hover:bg-red-50 transition-all font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                              >
                                <Trash2 className="w-3 h-3" /> Cancel Session
                              </button>
                            </div>
                          </div>
                        ) : (
                          <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={cn(
                              "flex flex-col items-center justify-center p-12 rounded-[3.5rem] border-2 border-dashed transition-all text-center",
                              booking.status === 'completed' ? 'text-primary border-primary/20 bg-primary/5' :
                              booking.status === 'rejected' ? 'text-red-500 border-red-200 bg-red-50/10' : 
                              'text-muted-foreground border-muted/20 bg-muted/5'
                            )}
                          >
                            <div className="mb-4 opacity-40">
                              {booking.status === 'completed' && <CheckCircle2 className="w-12 h-12" />}
                              {booking.status === 'rejected' && <XCircle className="w-12 h-12" />}
                              {booking.status === 'cancelled' && <Trash2 className="w-12 h-12" />}
                            </div>
                            <span className="font-black uppercase tracking-[0.3em] text-[10px] block mb-2">
                              {booking.status}
                            </span>
                            <span className="text-[10px] font-medium opacity-50 italic">
                              {booking.status === 'completed' ? 'Healing path taken' : 'Session closed'}
                            </span>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        </>
        ) : (
          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-[0_10px_40px_rgba(0,0,0,0.03)] border border-primary/5">
            <h2 className="text-3xl font-serif text-primary tracking-tight mb-8">Manage Availability Rules</h2>
            <div className="flex flex-col lg:flex-row gap-12">
              <div className="flex-1 space-y-6">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-accent tracking-widest ml-1 mb-3 opacity-60">Day of Week</label>
                  <select 
                    value={availDay}
                    onChange={(e) => setAvailDay(Number(e.target.value))}
                    className="block w-full h-14 rounded-2xl bg-[#FAFAFA] border-none px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold text-accent tracking-widest ml-1 mb-3 opacity-60">Start Time</label>
                    <input 
                      type="time"
                      value={availStart}
                      onChange={(e) => setAvailStart(e.target.value)}
                      className="block w-full h-14 rounded-2xl bg-[#FAFAFA] border-none px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold text-accent tracking-widest ml-1 mb-3 opacity-60">End Time</label>
                    <input 
                      type="time"
                      value={availEnd}
                      onChange={(e) => setAvailEnd(e.target.value)}
                      className="block w-full h-14 rounded-2xl bg-[#FAFAFA] border-none px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-accent tracking-widest ml-1 mb-3 opacity-60">Slot Duration (Min)</label>
                  <select 
                    value={availDuration}
                    onChange={(e) => setAvailDuration(Number(e.target.value))}
                    className="block w-full h-14 rounded-2xl bg-[#FAFAFA] border-none px-6 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                  >
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                    <option value={90}>90 Minutes</option>
                  </select>
                </div>
                <Button 
                  onClick={handleSaveAvailability} 
                  disabled={loading || !availStart || !availEnd}
                  className="w-full h-14 rounded-2xl text-base mt-4 font-bold"
                >
                  Save Rule
                </Button>
              </div>

              <div className="flex-1 bg-[#FCFAF7] p-8 rounded-[2rem] border border-primary/5 h-fit">
                <h3 className="font-serif text-xl tracking-tight text-primary mb-6 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-accent" /> Active Rules
                </h3>
                <div className="space-y-4">
                  {myRules.length === 0 ? (
                    <p className="text-sm text-primary/40 italic">No availability rules set.</p>
                  ) : (
                    myRules.map((rule: any) => {
                      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                      return (
                      <div key={rule.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white rounded-2xl border border-primary/5 gap-4">
                        <div>
                          <div className="font-bold text-sm text-primary">Every {days[rule.dayOfWeek]}</div>
                          <div className="text-xs text-primary/50 mt-1">{rule.startTime} - {rule.endTime} ({rule.slotDuration}m)</div>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteAvailability(rule.id)}
                          className="h-8 text-[10px] uppercase font-bold text-red-500 hover:bg-red-50"
                        >
                          Remove
                        </Button>
                      </div>
                    )})
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const StatusBadge = ({ status }: { status: BookingStatus }) => {
  const styles: Record<BookingStatus, string> = {
    pending: "bg-amber-50 text-amber-600 border-amber-100",
    confirmed: "bg-green-50 text-green-600 border-green-100",
    rejected: "bg-red-50 text-red-600 border-red-100",
    completed: "bg-primary/5 text-primary border-primary/10",
    cancelled: "bg-slate-50 text-slate-500 border-slate-100"
  }

  const icons: Record<BookingStatus, React.ReactNode> = {
    pending: <Loader2 className="w-3 h-3 animate-pulse" />,
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
