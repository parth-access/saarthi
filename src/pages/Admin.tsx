import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion, AnimatePresence } from "motion/react"
import { 
  Mail, 
  Calendar, 
  User, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  LogOut, 
  Filter, 
  Info, 
  ChevronDown,
  Trash2,
  Check
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { format, parseISO, isSameDay } from "date-fns"
import { Button } from "../components/ui/Button"
import { cn } from "../lib/utils"
import { BookingStatus, Booking, Therapist } from "../types"

const AdminPage = () => {
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [therapists, setTherapists] = React.useState<Record<string, Therapist>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [processingId, setProcessingId] = React.useState<string | null>(null)
  
  // Filter states
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | 'all'>('all')
  const [dateFilter, setDateFilter] = React.useState("")
  
  const navigate = useNavigate()

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch Bookings
      const bRes = await fetch('/api/get-bookings')
      const bData = await bRes.json()
      
      if (!bData.success) throw new Error(bData.error || "Failed to load bookings")
      
      // Fetch Therapists
      const tRes = await fetch('/api/get-therapists')
      const tData = await tRes.json()
      
      if (tData.success) {
        const tMap: Record<string, Therapist> = {}
        tData.therapists.forEach((t: Therapist) => { tMap[t.id] = t })
        setTherapists(tMap)
      }

      setBookings(bData.bookings)
      setError("")
    } catch (err: any) {
      console.error("Fetch data error:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    const isAuthenticated = localStorage.getItem("isAdminAuthenticated") === "true"
    if (!isAuthenticated) {
      navigate("/")
      return
    }
    fetchData()
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated")
    navigate("/")
  }

  const handleUpdateStatus = async (id: string, status: BookingStatus) => {
    try {
      setProcessingId(id)
      const response = await fetch('/api/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b))
      } else {
        setError(data.error || "Failed to update status")
      }
    } catch (err: any) {
      console.error("Update status error:", err)
      setError("Something went wrong while updating the booking status.")
    } finally {
      setProcessingId(null)
    }
  }

  const filteredBookings = bookings.filter(b => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesDate = !dateFilter || b.date === dateFilter;
    return matchesStatus && matchesDate;
  })

  const getTherapistName = (id: string) => therapists[id]?.name || "Unknown Therapist"

  return (
    <div className="pt-32 pb-24 min-h-screen bg-[#fcfaf7] selection:bg-primary/10">
      <Helmet>
        <title>Admin Dashboard | Saarthi</title>
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
          <div>
            <h1 className="text-5xl md:text-6xl font-serif text-primary tracking-tight">Session Manager</h1>
            <p className="text-muted-foreground font-sans mt-4 max-w-lg">Manage incoming session requests, verify availability, and provide clarity to your clients.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="rounded-full bg-white px-8" onClick={fetchData}>
              Refresh Database
            </Button>
            <Button 
              variant="outline"
              onClick={handleLogout}
              className="px-6 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </header>

        {/* 🛠 FILTER BAR */}
        <div className="bg-white border-2 border-primary/5 rounded-[2.5rem] p-8 mb-12 shadow-sm">
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-3 text-sm font-black text-primary/40 uppercase tracking-[0.2em]">
              <Filter className="w-4 h-4" /> Filters
            </div>
            
            <div className="flex-1 flex flex-wrap gap-6">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-muted-foreground ml-1">By Status</label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="block w-48 h-12 rounded-2xl bg-[#f8f9fa] border-none px-4 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.67%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_15px_center] bg-no-repeat"
                >
                  <option value="all">All Request Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-muted-foreground ml-1">By Date</label>
                <input 
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="block h-12 rounded-2xl bg-[#f8f9fa] border-none px-4 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="ml-auto text-sm font-medium text-muted-foreground bg-primary/5 px-4 py-2 rounded-full">
              Showing <span className="text-primary font-bold">{filteredBookings?.length || 0}</span> of <span className="text-primary font-bold">{bookings?.length || 0}</span> requests
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3">
             <Info className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground">
            <Loader2 className="h-16 w-16 animate-spin mb-4 text-primary/30" />
            <p className="font-serif text-xl italic text-primary/40">Gathering session data...</p>
          </div>
        ) : (filteredBookings?.length || 0) === 0 ? (
          <div className="text-center py-32 bg-white rounded-[3.5rem] border-2 border-dashed border-primary/5">
            <div className="bg-primary/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-10 h-10 text-primary/20" />
            </div>
            <p className="text-3xl font-serif text-primary/40 mb-3">No sessions matching filters</p>
            <p className="text-muted-foreground max-w-xs mx-auto">Try broadening your filters or refreshing the database.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <AnimatePresence mode="popLayout">
              {filteredBookings?.map((booking) => (
                <motion.div
                  key={booking.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white p-10 md:p-12 rounded-[3.5rem] shadow-sm border border-primary/5 hover:border-primary/10 transition-all group"
                >
                  <div className="flex flex-col xl:flex-row gap-12">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-8 mb-10">
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-4">
                            <h2 className="text-4xl font-serif text-primary">{booking.name}</h2>
                            <StatusBadge status={booking.status} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-muted-foreground text-sm font-medium">
                            <span className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-primary/40" /> {booking.email}
                            </span>
                            <span className="flex items-center gap-2 bg-primary/5 px-4 py-1.5 rounded-full text-xs font-black text-primary/70 uppercase tracking-widest">
                              <User className="h-4 w-4" /> {booking.gender}, {booking.age} yrs
                            </span>
                            <span className="flex items-center gap-2 text-accent italic">
                              <ShieldCheck className="h-4 w-4" /> {getTherapistName(booking.therapistId)}
                            </span>
                            <span className="font-black text-primary/40 uppercase tracking-tighter decoration-accent/30 underline-offset-4 underline">
                              {booking.sessionType} Session
                            </span>
                          </div>
                        </div>
                        
                        <div className="bg-[#fcfaf7] p-6 rounded-[2.5rem] border-2 border-primary/5 text-center min-w-[160px] shadow-sm">
                          <div className="text-[10px] font-black text-primary/30 uppercase tracking-[0.2em] mb-2">Requested slot</div>
                          <div className="text-2xl font-serif font-bold text-primary">
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
                          <div className="text-xs font-black text-accent uppercase mt-1">
                            at {booking.time}
                          </div>
                        </div>
                      </div>

                      <div className="relative pl-8 mb-10">
                         <div className="absolute left-0 top-1 bottom-1 w-[3px] bg-accent/20 rounded-full" />
                         <p className="text-muted-foreground leading-relaxed italic text-xl text-primary/80">
                           "{booking.message || 'No specific initial note provided.'}"
                         </p>
                      </div>

                      <div className="flex items-center justify-between pt-8 border-t border-primary/5">
                         <div className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/40">
                           System Log: Received {(() => {
                             try {
                               const dateVal = booking.createdAt?.seconds 
                                 ? new Date(booking.createdAt.seconds * 1000) 
                                 : booking.createdAt 
                                   ? new Date(booking.createdAt) 
                                   : null;
                               return dateVal && !isNaN(dateVal.getTime()) 
                                 ? format(dateVal, "PPP p") 
                                 : "Date N/A";
                             } catch (e) {
                               return "N/A"
                             }
                           })()}
                         </div>
                      </div>
                    </div>

                    <div className="xl:w-64 flex flex-row xl:flex-col gap-4">
                      {booking.status === 'pending' ? (
                        <>
                          <button
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'confirmed')}
                            className="flex-1 h-16 flex items-center justify-center gap-3 bg-primary text-white rounded-3xl hover:bg-primary/95 transition-all font-bold shadow-xl shadow-primary/20 disabled:opacity-50"
                          >
                            {processingId === booking.id ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                            Confirm Session
                          </button>
                          <button
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'rejected')}
                            className="flex-1 h-16 flex items-center justify-center gap-3 bg-red-50 text-red-600 rounded-3xl hover:bg-red-100 transition-all font-bold disabled:opacity-50 border-2 border-red-100"
                          >
                            {processingId === booking.id ? <Loader2 className="h-6 w-6 animate-spin" /> : <XCircle className="h-6 w-6" />}
                            Decline
                          </button>
                        </>
                      ) : booking.status === 'confirmed' ? (
                        <div className="flex flex-col gap-4">
                          <div className="p-8 rounded-[2.5rem] border-2 border-green-200 bg-green-50/30 flex flex-col items-center justify-center text-green-700">
                             <CheckCircle2 className="w-10 h-10 mb-2" />
                             <span className="font-black uppercase tracking-[0.1em] text-xs">Confirmed</span>
                          </div>
                          <button 
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'completed')}
                            className="h-14 bg-white border-2 border-primary/10 text-primary rounded-2xl hover:bg-primary/5 transition-all font-bold text-sm flex items-center justify-center gap-2"
                          >
                            <Check className="w-4 h-4" /> Mark Completed
                          </button>
                          <button 
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'cancelled')}
                            className="h-14 bg-white border-2 border-red-100 text-red-500 rounded-2xl hover:bg-red-50 transition-all font-bold text-sm flex items-center justify-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" /> Cancel Session
                          </button>
                        </div>
                      ) : (
                        <div className={cn(
                          "flex-1 flex flex-col items-center justify-center p-8 rounded-[2.5rem] border-2 border-dashed transition-all",
                          booking.status === 'completed' ? 'text-primary border-primary/20 bg-primary/5' :
                          booking.status === 'rejected' ? 'text-red-500 border-red-200 bg-red-50/20' : 
                          'text-muted-foreground border-muted/20 bg-muted/5'
                        )}>
                          {booking.status === 'completed' && <CheckCircle2 className="w-10 h-10 mb-2 opacity-40" />}
                          {booking.status === 'rejected' && <XCircle className="w-10 h-10 mb-2 opacity-40" />}
                          {booking.status === 'cancelled' && <Trash2 className="w-10 h-10 mb-2 opacity-40" />}
                          <span className="font-black uppercase tracking-[0.2em] text-[10px]">
                            {booking.status}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

const StatusBadge = ({ status }: { status: BookingStatus }) => {
  const styles: Record<BookingStatus, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    confirmed: "bg-green-100/50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-100",
    completed: "bg-primary/10 text-primary border-primary/20",
    cancelled: "bg-muted text-muted-foreground border-muted/20"
  }

  return (
    <span className={cn("px-5 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-full border shadow-sm", styles[status])}>
      {status}
    </span>
  )
}

export default AdminPage
