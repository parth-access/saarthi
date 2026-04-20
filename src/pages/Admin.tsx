import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion, AnimatePresence } from "motion/react"
import { Mail, Calendar, User, ShieldCheck, CheckCircle2, XCircle, Loader2, LogOut, Filter, Info, ChevronDown } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { format, parseISO, isSameDay } from "date-fns"
import { Button } from "../components/ui/Button"
import { cn } from "../lib/utils"
import { BookingStatus, Booking } from "../types"

const AdminPage = () => {
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [processingId, setProcessingId] = React.useState<string | null>(null)
  
  // Filter states
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | 'all'>('all')
  const [dateFilter, setDateFilter] = React.useState("")
  
  const navigate = useNavigate()

  const fetchBookings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/get-bookings')
      const data = await response.json()
      
      if (data.success) {
        setBookings(data.bookings)
        setError("")
      } else {
        throw new Error(data.error || "Failed to load bookings")
      }
    } catch (err: any) {
      console.error("Fetch bookings error:", err)
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
    fetchBookings()
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
            <Button variant="outline" className="rounded-full bg-white" onClick={fetchBookings}>
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

        {/* 🛠 FILTER BAR (Recipe 1 inspired) */}
        <div className="bg-white border-2 border-primary/5 rounded-3xl p-6 mb-8 shadow-sm">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary/60 uppercase tracking-widest">
              <Filter className="w-4 h-4" /> Filters
            </div>
            
            <div className="flex-1 flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Status</label>
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="block w-40 h-10 rounded-xl bg-[#f8f9fa] border-none px-3 text-sm focus:ring-2 focus:ring-primary/20 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%236B7280%22%20stroke-width%3D%221.67%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Date</label>
                <input 
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="block h-10 rounded-xl bg-[#f8f9fa] border-none px-3 text-sm focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="ml-auto text-sm font-medium text-muted-foreground">
              Showing {filteredBookings.length} of {bookings.length} requests
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
            <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary/30" />
            <p className="font-sans text-lg italic">Gathering your schedule...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-32 bg-white/50 rounded-[3rem] border-2 border-dashed border-primary/10">
            <div className="bg-primary/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-primary/40" />
            </div>
            <p className="text-2xl font-serif text-primary/60 mb-2">No session requests found</p>
            <p className="text-muted-foreground">Try adjusting your filters or refreshing the data.</p>
          </div>
        ) : (
          <div className="grid gap-8">
            <AnimatePresence mode="popLayout">
              {filteredBookings.map((booking) => (
                <motion.div
                  key={booking.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="bg-white p-8 md:p-10 rounded-[3rem] shadow-sm border border-primary/5 hover:border-primary/10 transition-all group"
                >
                  <div className="flex flex-col xl:flex-row gap-10">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <h2 className="text-3xl font-serif text-primary">{booking.name}</h2>
                            <StatusBadge status={booking.status} />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
                            <span className="flex items-center gap-2">
                              <Mail className="h-4 w-4" /> {booking.email}
                            </span>
                            <span className="flex items-center gap-2 bg-[#f5f2ed] px-3 py-1 rounded-full text-xs font-bold text-primary/70">
                              <User className="h-4 w-4" /> {booking.gender}, {booking.age} yrs
                            </span>
                            <span className="font-bold underline text-accent">
                              {booking.sessionType} Session
                            </span>
                          </div>
                        </div>
                        
                        <div className="bg-[#fcfaf7] p-4 rounded-[2rem] border border-primary/5 text-center min-w-[140px]">
                          <div className="text-sm font-bold text-primary/60 uppercase tracking-tighter mb-1">Requested slot</div>
                          <div className="text-lg font-serif text-primary">
                            {booking.date ? (
                              (() => {
                                try {
                                  return format(parseISO(booking.date), "dd MMM")
                                } catch (e) {
                                  return "Invalid Date"
                                }
                              })()
                            ) : "Date N/A"}
                          </div>
                          <div className="text-xs font-mono font-bold text-accent uppercase">
                            at {booking.time}
                          </div>
                        </div>
                      </div>

                      <div className="relative group/msg">
                        <div className="absolute -left-6 top-0 bottom-0 w-[2px] bg-accent/20 rounded-full" />
                        <p className="text-muted-foreground leading-relaxed italic text-lg pl-2">
                          "{booking.message || 'No message provided.'}"
                        </p>
                      </div>

                      <div className="mt-8 pt-8 border-t border-primary/5 flex items-center justify-between">
                         <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50">
                           Received {(() => {
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
                               return "Date N/A"
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
                            className="flex-1 h-14 flex items-center justify-center gap-3 bg-primary text-white rounded-2xl hover:bg-primary/90 transition-all font-bold shadow-lg shadow-primary/20 disabled:opacity-50"
                          >
                            {processingId === booking.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                            Confirm
                          </button>
                          <button
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'rejected')}
                            className="flex-1 h-14 flex items-center justify-center gap-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all font-bold disabled:opacity-50 border border-red-100"
                          >
                            {processingId === booking.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <XCircle className="h-5 w-5" />}
                            Reject
                          </button>
                        </>
                      ) : (
                        <div className={cn(
                          "flex-1 flex flex-col items-center justify-center p-6 rounded-[2rem] border-2 border-dashed transition-all",
                          booking.status === 'confirmed' ? 'text-green-600 border-green-200 bg-green-50/20' : 'text-red-500 border-red-200 bg-red-50/20'
                        )}>
                          {booking.status === 'confirmed' ? (
                            <>
                              <CheckCircle2 className="w-8 h-8 mb-2" />
                              <span className="font-bold uppercase tracking-tighter">Confirmed</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-8 h-8 mb-2" />
                              <span className="font-bold uppercase tracking-tighter">Rejected</span>
                            </>
                          )}
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
    confirmed: "bg-green-100 text-green-700 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200"
  }

  return (
    <span className={cn("px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] rounded-full border shadow-sm", styles[status])}>
      {status}
    </span>
  )
}

export default AdminPage
