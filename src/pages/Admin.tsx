import * as React from "react"
import { Helmet } from "react-helmet-async"
import { motion, AnimatePresence } from "motion/react"
import { Mail, Calendar, User, ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react"

interface Booking {
  id: string;
  name: string;
  email: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

const AdminPage = () => {
  const [bookings, setBookings] = React.useState<Booking[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [processingId, setProcessingId] = React.useState<string | null>(null)

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
    fetchBookings()
  }, [])

  const handleUpdateStatus = async (bookingId: string, status: 'accepted' | 'rejected') => {
    try {
      setProcessingId(bookingId)
      const response = await fetch('/api/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, status })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Refresh local state
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status } : b))
      } else {
        alert(data.error || "Failed to update status")
      }
    } catch (err: any) {
      console.error("Update status error:", err)
      alert("Something went wrong while updating the booking status.")
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="pt-32 pb-24 min-h-screen bg-background selection:bg-primary/10">
      <Helmet>
        <title>Admin Dashboard | Saarthi</title>
      </Helmet>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h1 className="text-5xl md:text-6xl font-serif text-primary">Booking Manager</h1>
            <p className="text-xl text-muted-foreground font-sans mt-3">Manage session requests and communications.</p>
          </div>
          <button 
            onClick={fetchBookings}
            className="px-6 py-2 bg-white rounded-full border border-primary/10 shadow-sm text-sm font-medium hover:bg-white/80 transition-colors"
          >
            Refresh Data
          </button>
        </header>

        {error && (
          <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-center">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin mb-4" />
            <p className="font-sans">Syncing with database...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-24 bg-white/50 rounded-[3rem] border border-dashed border-primary/20">
            <p className="text-2xl font-serif text-primary mb-2">No bookings found</p>
            <p className="text-muted-foreground">When someone reaches out, they will appear here.</p>
          </div>
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
                  className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-soft border border-primary/5 hover:border-primary/10 transition-colors"
                >
                  <div className="flex flex-col md:flex-row gap-8">
                    <div className="flex-1 space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-text">{booking.name}</h2>
                            <StatusBadge status={booking.status} />
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Mail className="h-4 w-4" />
                            {booking.email}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {new Date(booking.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="bg-primary/5 p-4 rounded-2xl">
                        <p className="text-muted-foreground leading-relaxed italic">
                          "{booking.message}"
                        </p>
                      </div>
                    </div>

                    <div className="md:w-48 flex flex-row md:flex-col gap-3 shrink-0">
                      {booking.status === 'pending' ? (
                        <>
                          <button
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'accepted')}
                            className="flex-1 h-12 flex items-center justify-center gap-2 bg-primary text-white rounded-2xl hover:bg-primary/90 transition-all font-medium disabled:opacity-50"
                          >
                            {processingId === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Accept
                          </button>
                          <button
                            disabled={!!processingId}
                            onClick={() => handleUpdateStatus(booking.id, 'rejected')}
                            className="flex-1 h-12 flex items-center justify-center gap-2 bg-red-50 text-red-600 rounded-2xl hover:bg-red-100 transition-all font-medium disabled:opacity-50 border border-red-100"
                          >
                            {processingId === booking.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Reject
                          </button>
                        </>
                      ) : (
                        <div className={`flex-1 flex items-center justify-center text-sm font-medium rounded-2xl border border-dashed ${
                          booking.status === 'accepted' ? 'text-green-600 border-green-200 bg-green-50/30' : 'text-red-600 border-red-200 bg-red-50/30'
                        }`}>
                          {booking.status === 'accepted' ? 'Accepted' : 'Rejected'}
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

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    accepted: "bg-green-100 text-green-700 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200"
  }

  return (
    <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border ${styles[status]}`}>
      {status}
    </span>
  )
}

export default AdminPage
