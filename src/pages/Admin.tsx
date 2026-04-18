import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion, AnimatePresence } from "motion/react"
import { db } from "../lib/firebase"
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc 
} from "firebase/firestore"
import { CheckCircle2, Clock, Check, Trash2, Calendar, Mail, User, ShieldCheck } from "lucide-react"

enum BookingStatus {
  PENDING = "Pending",
  CONFIRMED = "Confirmed",
  COMPLETED = "Completed"
}

interface Booking {
  id: string;
  name: string;
  email: string;
  date: string;
  time: string;
  message: string;
  status: BookingStatus;
  createdAt: any;
}

const AdminPage = () => {
  const [password, setPassword] = React.useState("")
  const [isAuthenticated, setIsAuthenticated] = React.useState(false)
  const [error, setError] = React.useState("")
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading, setLoading] = React.useState(true)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === "saarthi-admin") {
      setIsAuthenticated(true)
      setError("")
    } else {
      setError("Incorrect password. Access denied.")
    }
  }

  React.useEffect(() => {
    if (!isAuthenticated) return

    const fetchBookings = async () => {
      try {
        const response = await fetch(`/api/get-bookings?password=${password}`)
        
        if (response.status === 401) {
          setError("Session expired or invalid credentials.")
          setIsAuthenticated(false)
          return
        }

        if (!response.ok) {
          throw new Error("Server error")
        }

        const data = await response.json()
        if (data.success) {
          setBookings(data.bookings)
          setError("")
        }
      } catch (err) {
        console.error("Fetch bookings error:", err)
        setError("Failed to fetch bookings. Please check your connection.")
      } finally {
        setLoading(false)
      }
    }

    fetchBookings()
    // Poll every 30 seconds for updates since we moved away from real-time snapshot
    const interval = setInterval(fetchBookings, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated, password])

  const updateStatus = async (id: string, newStatus: BookingStatus) => {
    try {
      const response = await fetch('/api/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, password })
      })
      const data = await response.json()
      if (data.success) {
        // Optimistic update
        setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b))
      }
    } catch (err) {
      console.error("Update status error:", err)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Helmet>
          <title>Admin Login | Saarthi</title>
        </Helmet>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 bg-white rounded-3xl shadow-soft border border-primary/5"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/5 text-primary mb-4">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-serif text-primary">Admin Access</h1>
            <p className="text-muted-foreground mt-2">Please enter the administrative password to manage Saarthi requests.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="password-field" className="text-sm font-medium text-text">Password</label>
              <input
                id="password-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex h-12 w-full rounded-xl border border-muted bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-300"
                placeholder="Enter password"
                autoFocus
              />
            </div>
            
            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg flex items-center gap-2">
                <Check className="h-4 w-4 rotate-45" /> {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full h-12 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              Sign In
            </button>
          </form>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background selection:bg-primary/10">
      <Helmet>
        <title>Admin Dashboard | Saarthi</title>
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-5xl md:text-6xl font-serif text-primary">Booking Manager</h1>
            <p className="text-xl text-muted-foreground font-sans mt-3">View and manage session requests from your clients.</p>
          </div>
          <div className="flex gap-4">
            <div className="px-4 py-2 bg-white rounded-full border border-primary/10 shadow-sm text-sm font-medium flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Real-time Updates Active
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
            <Clock className="h-10 w-10 animate-spin mb-4" />
            <p>Fetching your requests...</p>
          </div>
        ) : bookings.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 bg-white/50 rounded-[3rem] border border-dashed border-primary/20"
          >
            <p className="text-2xl font-serif text-primary mb-2">No requests yet.</p>
            <p className="text-muted-foreground">You're all caught up for now 🌿</p>
          </motion.div>
        ) : (
          <div className="grid gap-6">
            <AnimatePresence mode="popLayout">
              {bookings.map((booking) => (
                <motion.div
                  key={booking.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white p-6 md:p-8 rounded-[2rem] shadow-soft border border-primary/5 hover:border-primary/10 transition-colors group"
                >
                  <div className="flex flex-col md:flex-row gap-8">
                    {/* Main Content */}
                    <div className="flex-1 space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-text">{booking.name}</h2>
                            <StatusBadge status={booking.status} />
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Mail className="h-4 w-4" />
                            <a href={`mailto:${booking.email}`} className="hover:text-primary transition-colors underline underline-offset-4 decoration-primary/20">
                              {booking.email}
                            </a>
                          </div>
                        </div>
                        <div className="flex flex-col text-right items-end">
                          <div className="flex items-center gap-2 text-primary font-medium">
                            <Calendar className="h-4 w-4" />
                            {booking.date}
                          </div>
                          <div className="text-sm text-muted-foreground font-mono mt-1">
                            {booking.time}
                          </div>
                        </div>
                      </div>

                      <div className="relative group/message">
                        <p className="text-muted-foreground leading-relaxed italic">
                          "{booking.message}"
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="md:w-48 flex flex-row md:flex-col gap-3 shrink-0">
                      {booking.status === BookingStatus.PENDING && (
                        <button
                          onClick={() => updateStatus(booking.id, BookingStatus.CONFIRMED)}
                          className="flex-1 h-12 flex items-center justify-center gap-2 bg-primary text-white rounded-2xl hover:bg-primary/90 transition-all font-medium"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirm
                        </button>
                      )}
                      
                      {booking.status === BookingStatus.CONFIRMED && (
                        <button
                          onClick={() => updateStatus(booking.id, BookingStatus.COMPLETED)}
                          className="flex-1 h-12 flex items-center justify-center gap-2 bg-muted text-muted-foreground rounded-2xl hover:bg-muted/80 transition-all font-medium border border-transparent"
                        >
                          <Check className="h-4 w-4" />
                          Complete
                        </button>
                      )}

                      {booking.status === BookingStatus.COMPLETED && (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-muted">
                          Archived
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
  const styles = {
    [BookingStatus.PENDING]: "bg-yellow-100 text-yellow-700 border-yellow-200",
    [BookingStatus.CONFIRMED]: "bg-green-100 text-green-700 border-green-200",
    [BookingStatus.COMPLETED]: "bg-gray-100 text-gray-700 border-gray-200"
  }

  return (
    <span className={`px-3 py-1 text-[11px] font-bold uppercase tracking-widest rounded-full border ${styles[status]}`}>
      {status}
    </span>
  )
}

export default AdminPage
