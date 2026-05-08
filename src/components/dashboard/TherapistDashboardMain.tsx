import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { format, parseISO, isToday, isPast, parse } from "date-fns"
import { 
  LogOut, 
  RefreshCw, 
  Check, 
  X, 
  Clock, 
  Calendar,
  AlertCircle,
  Loader2,
  Trash2,
  Bell,
  Sun,
  Moon,
  Coffee,
  CheckCircle2,
  LayoutGrid,
  ChevronRight,
  User,
  Users,
  Search,
  Filter,
  ChevronDown
} from "lucide-react"
import { Booking, BookingStatus, Therapist } from "../../types"
import { cn } from "../../lib/utils"

interface TherapistDashboardProps {
  therapist: Therapist | null;
  bookings: Booking[];
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  onLogout: () => void;
  onUpdateStatus: (id: string, status: BookingStatus) => Promise<void>;
  processingId: string | null;
  scheduleBuilderNode?: React.ReactNode;
  adminTherapistsNode?: React.ReactNode;
  isAdmin?: boolean;
}

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 12) return { text: "Good Morning", icon: Coffee }
  if (hour < 17) return { text: "Good Afternoon", icon: Sun }
  return { text: "Good Evening", icon: Moon }
}

export const TherapistDashboard: React.FC<TherapistDashboardProps> = ({
  therapist,
  bookings,
  loading,
  error,
  onRefresh,
  onLogout,
  onUpdateStatus,
  processingId,
  scheduleBuilderNode,
  adminTherapistsNode,
  isAdmin
}) => {
  const [activeTab, setActiveTab] = React.useState<'overview' | 'sessions' | 'schedule' | 'therapists'>('overview');
  
  // Filter state
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<BookingStatus | 'all'>('all');
  const [dateFilter, setDateFilter] = React.useState("");

  const greeting = React.useMemo(() => getGreeting(), []);
  
  // Basic categorization
  const todayBookings = React.useMemo(() => bookings.filter(b => {
    if (!b.date) return false;
    try { return isToday(parseISO(b.date)) } catch { return false }
  }), [bookings]);

  const pendingBookings = React.useMemo(() => bookings.filter(b => b.status === 'pending'), [bookings]);
  const upcomingBookings = React.useMemo(() => bookings.filter(b => b.status === 'confirmed'), [bookings]);
  const recentBookings = React.useMemo(() => bookings.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'rejected').slice(0, 5), [bookings]);

  // Filtered master list
  const filteredBookings = React.useMemo(() => {
    return bookings.filter(b => {
      const matchesSearch = 
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.sessionType.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchesDate = !dateFilter || b.date === dateFilter;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [bookings, searchTerm, statusFilter, dateFilter]);

  const isFiltering = searchTerm !== "" || statusFilter !== 'all' || dateFilter !== "";

  const GreetingIcon = greeting.icon;

  const displayName = isAdmin ? "Administrator" : (therapist?.name?.split(' ')[0] || 'Therapist');


  return (
    <div className="pt-16 min-h-screen bg-[#FCFAF7] selection:bg-primary/10 font-sans text-primary">
      {/* TOP HEADER */}
      <header className="bg-white border-b border-primary/5 relative z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/5 rounded-2xl flex items-center justify-center text-primary/40">
              <GreetingIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-medium flex items-center gap-2">
                {greeting.text}, {isAdmin ? '' : 'Dr. '}{displayName} <span className="animate-wave inline-block origin-bottom-right">👋</span>
              </h1>
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                You have {todayBookings.length} sessions today and {pendingBookings.length} pending
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={onRefresh}
              disabled={loading}
              className="w-10 h-10 rounded-2xl border border-primary/5 flex items-center justify-center text-primary/40 hover:bg-primary/5 hover:text-primary transition-all disabled:opacity-50"
              title="Sync Database"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
            <button className="w-10 h-10 rounded-2xl border border-primary/5 flex items-center justify-center text-primary/40 hover:bg-primary/5 hover:text-primary transition-all relative">
              <Bell className="w-4 h-4" />
              {pendingBookings.length > 0 && (
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
              )}
            </button>
            <div className="w-[1px] h-6 bg-primary/5 mx-1" />
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 px-4 h-10 rounded-2xl border border-primary/5 text-xs font-bold uppercase tracking-widest text-primary/40 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* TAB NAVIGATION */}
        <div className="flex items-center gap-6 border-b border-primary/5 mb-8 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "pb-4 text-sm font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap",
              activeTab === 'overview' ? "border-primary text-primary" : "border-transparent text-primary/30 hover:text-primary/60"
            )}
          >
            Dashboard Overview
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={cn(
              "pb-4 text-sm font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap",
              activeTab === 'sessions' ? "border-primary text-primary" : "border-transparent text-primary/30 hover:text-primary/60"
            )}
          >
            All Sessions
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={cn(
              "pb-4 text-sm font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap",
              activeTab === 'schedule' ? "border-primary text-primary" : "border-transparent text-primary/30 hover:text-primary/60"
            )}
          >
            Availability & Rules
          </button>
          {adminTherapistsNode && (
            <button
              onClick={() => setActiveTab('therapists')}
              className={cn(
                "pb-4 text-sm font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap",
                activeTab === 'therapists' ? "border-primary text-primary" : "border-transparent text-primary/30 hover:text-primary/60"
              )}
            >
              Manage Therapists
            </button>
          )}
        </div>

        {activeTab === 'sessions' && (
          <div className="bg-white border border-primary/5 rounded-[2rem] p-6 sm:p-8 mb-10 shadow-sm sticky top-36 z-20">
            <div className="flex flex-col lg:flex-row gap-6">
              
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                <input 
                  type="text"
                  placeholder="Search by name, email, or session type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#FCFAF7] border-non focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm placeholder:font-normal placeholder:text-primary/30 outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="relative group min-w-[200px]">
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="w-full h-12 rounded-xl bg-[#FCFAF7] border-none px-4 pr-10 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer outline-none"
                  >
                    <option value="all">All Request Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="rejected">Rejected</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40 pointer-events-none" />
                </div>

                <div className="relative min-w-[200px]">
                  <input 
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full h-12 rounded-xl bg-[#FCFAF7] border-none px-4 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer outline-none"
                  />
                  {dateFilter && (
                    <button 
                      onClick={() => setDateFilter("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary/5 text-primary/40 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700 text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        {activeTab === 'overview' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            
            {/* LEFT COLUMN (70%) */}
            <div className="lg:col-span-8 space-y-10">
              
              {/* STATS ROW */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard 
                  title="Today's Sessions" 
                  value={todayBookings.length}
                  icon={Clock}
                  colorClass="bg-[#FFFBE7] text-amber-900 border-[#E6A520]/20"
                />
                <StatCard 
                  title="Pending Requests" 
                  value={pendingBookings.length}
                  icon={AlertCircle}
                  colorClass={pendingBookings.length > 0 ? "bg-red-50 text-red-900 border-red-100" : "bg-white text-muted-foreground border-primary/5"}
                />
                <StatCard 
                  title="Confirmed Upcoming" 
                  value={upcomingBookings.length}
                  icon={CheckCircle2}
                  colorClass="bg-green-50 text-green-900 border-green-100"
                />
                <StatCard 
                  title="Total Processed" 
                  value={recentBookings.length + upcomingBookings.length}
                  icon={LayoutGrid}
                  colorClass="bg-primary/5 text-primary border-primary/5"
                />
              </div>

              {/* PENDING REQUESTS SECTION */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-serif text-primary">Session Requests</h2>
                  {pendingBookings.length > 0 && <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">{pendingBookings.length} New</span>}
                </div>
                <div className="space-y-4">
                  {pendingBookings.length === 0 ? (
                    <EmptyState message="No pending session requests." />
                  ) : (
                    pendingBookings.map(b => (
                      <NewSessionCard key={b.id} booking={b} isProcessing={processingId === b.id} onUpdateStatus={onUpdateStatus} />
                    ))
                  )}
                </div>
              </section>

              {/* UPCOMING SESSIONS SECTION */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-serif text-primary">Upcoming Sessions</h2>
                </div>
                <div className="space-y-4">
                  {upcomingBookings.length === 0 ? (
                    <EmptyState message="No upcoming confirmed sessions." />
                  ) : (
                    upcomingBookings.map(b => (
                      <NewSessionCard key={b.id} booking={b} isProcessing={processingId === b.id} onUpdateStatus={onUpdateStatus} />
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN (30%) */}
            <div className="lg:col-span-4 space-y-8">
              
              {/* NEEDS ATTENTION WIDGET */}
              {pendingBookings.length > 0 && (
                <div className="bg-red-50/50 rounded-[2rem] border border-red-100 p-6 md:p-8 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                     <AlertCircle className="w-24 h-24 text-red-500" />
                  </div>
                  <div className="flex items-center gap-3 mb-6 relative z-10">
                     <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                       <AlertCircle className="w-4 h-4" />
                     </div>
                     <h3 className="font-serif text-lg text-red-900">Needs Attention</h3>
                  </div>
                  <div className="space-y-3 relative z-10">
                    <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-sm flex items-center justify-between">
                       <div>
                         <div className="text-red-900 font-bold mb-0.5">{pendingBookings.length} Session Request{pendingBookings.length > 1 ? 's' : ''}</div>
                         <div className="text-xs text-red-600">Awaiting your response</div>
                       </div>
                       <button onClick={() => window.scrollTo({top: 200, behavior: 'smooth'})} className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-600 hover:bg-red-100 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TODAY'S SCHEDULE WIDGET */}
              <div className="bg-white rounded-[2rem] border border-primary/5 p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-serif text-lg">Today's Schedule</h3>
                  <div className="text-xs uppercase tracking-widest font-bold text-primary/30">
                    {format(new Date(), "MMM d")}
                  </div>
                </div>
                
                <div className="space-y-4 relative">
                  <div className="absolute left-3.5 top-2 bottom-4 w-px bg-primary/5" />
                  {todayBookings.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic relative z-10 pl-10">Schedule is clear for today.</p>
                  ) : (
                    todayBookings.map((b) => (
                      <div key={b.id} className="relative z-10 pl-10">
                        <div className={cn(
                          "absolute left-2.5 top-1.5 w-2 h-2 rounded-full ring-4 ring-white",
                          b.status === 'confirmed' ? "bg-green-500" : b.status === 'pending' ? "bg-amber-400" : "bg-primary/20"
                        )} />
                        <div className="bg-[#FCFAF7] rounded-2xl p-4 border border-primary/5 group hover:border-primary/10 transition-colors">
                          <div className="text-xs font-bold text-primary/40 mb-1">{b.time}</div>
                          <div className="font-medium text-sm text-primary group-hover:text-amber-800 transition-colors">{b.name}</div>
                          <div className="text-xs text-muted-foreground capitalize mt-1 flex items-center gap-2">
                             <span className="w-1.5 h-1.5 rounded-full bg-primary/20" /> {b.sessionType}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* RECENT ACTIVITY WIDGET */}
              <div className="bg-white rounded-[2rem] border border-primary/5 p-6 md:p-8 shadow-sm">
                 <h3 className="font-serif text-lg mb-6">Recent Activity</h3>
                 <div className="space-y-3">
                   {recentBookings.length === 0 ? (
                     <p className="text-sm text-muted-foreground italic">No recent activity.</p>
                   ) : (
                     recentBookings.map(b => (
                       <div key={b.id} className="flex items-center justify-between p-3 rounded-2xl hover:bg-[#FCFAF7] transition-colors border border-transparent hover:border-primary/5 cursor-default">
                         <div className="flex items-center gap-3">
                           <div className={cn(
                             "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                             b.status === 'completed' ? "bg-green-100 text-green-700" :
                             b.status === 'rejected' ? "bg-red-100 text-red-700" : "bg-primary/5 text-primary/40"
                           )}>
                             {b.status === 'completed' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                           </div>
                           <div>
                             <div className="text-sm font-medium">{b.name}</div>
                             <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">{b.status}</div>
                           </div>
                         </div>
                         <div className="text-xs text-primary/30">
                           {b.date ? format(parseISO(b.date), "MMM d") : ""}
                         </div>
                       </div>
                     ))
                   )}
                 </div>
              </div>

            </div>
          </div>
        ) : activeTab === 'sessions' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {filteredBookings.length === 0 ? (
              <EmptyState message="No sessions match your filters." />
            ) : (
              <div className="space-y-4">
                <div className="text-xs uppercase font-bold tracking-widest text-primary/30 mb-6">Showing {filteredBookings.length} sessions</div>
                {filteredBookings.map(b => (
                  <NewSessionCard key={b.id} booking={b} isProcessing={processingId === b.id} onUpdateStatus={onUpdateStatus} />
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'schedule' ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white rounded-[3rem] p-4 sm:p-8 md:p-12 border border-primary/5 shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
            {scheduleBuilderNode}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white rounded-[3rem] p-4 sm:p-8 md:p-12 border border-primary/5 shadow-[0_10px_40px_rgba(0,0,0,0.02)]">
            {adminTherapistsNode}
          </div>
        )}
      </div>
    </div>
  )
}

const StatCard = ({ title, value, icon: Icon, colorClass }: any) => (
  <div className={cn("p-5 rounded-3xl border transition-all hover:-translate-y-0.5 hover:shadow-md", colorClass)}>
    <div className="flex items-center gap-3 mb-4 opacity-70">
      <Icon className="w-4 h-4" />
      <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
    </div>
    <div className="text-4xl font-serif">{value}</div>
  </div>
)

const EmptyState = ({ message }: { message: string }) => (
  <div className="p-8 rounded-3xl border-2 border-dashed border-primary/10 text-center bg-white/50">
    <div className="w-12 h-12 bg-primary/5 rounded-full flex items-center justify-center mx-auto mb-4">
      <Calendar className="w-5 h-5 text-primary/20" />
    </div>
    <p className="text-sm font-medium text-primary/40">{message}</p>
  </div>
)

const NewSessionCard = ({ booking, onUpdateStatus, isProcessing }: any) => {
  const formattedDate = booking.date ? format(parseISO(booking.date), "EEEE, MMM d, yyyy") : 'No Date';

  const StatusIcon = booking.status === 'pending' ? Clock : 
                     booking.status === 'confirmed' ? CheckCircle2 :
                     booking.status === 'completed' ? Check : X;

  return (
    <div className="bg-white rounded-3xl p-5 md:p-6 border border-primary/5 hover:border-primary/10 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all group overflow-hidden relative">
      {booking.status === 'pending' && <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />}
      {booking.status === 'confirmed' && <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />}
      
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        
        {/* Left Side: Detail */}
        <div className="flex-1 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-serif font-medium text-primary group-hover:text-amber-800 transition-colors">
                {booking.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold uppercase tracking-widest text-primary/40">
                <span className="flex items-center gap-1.5"><User className="w-3 h-3" /> {booking.gender}, {booking.age}y</span>
                <span>•</span>
                <span className="px-2 py-0.5 rounded-full bg-primary/5">{booking.sessionType}</span>
              </div>
            </div>
            
            <div className="md:hidden text-right">
              <div className="text-sm font-medium">{formattedDate}</div>
              <div className="text-sm font-bold text-accent">{booking.time}</div>
            </div>
          </div>

          <div className="bg-[#FCFAF7] p-4 rounded-2xl border border-primary/5 text-sm text-primary/70 leading-relaxed italic pr-8 relative">
            <span className="absolute top-4 right-4 text-primary/10 font-serif text-4xl leading-none">"</span>
            {booking.message || "No specific reasons provided for the session."}
          </div>
        </div>

        {/* Right Side: Date/Time & Action */}
        <div className="md:w-64 flex flex-col md:items-end justify-between gap-6 border-t md:border-t-0 md:border-l border-primary/5 pt-4 md:pt-0 md:pl-6 shrink-0">
          <div className="hidden md:block text-right w-full">
            <div className="text-xs uppercase font-bold tracking-widest text-primary/30 mb-1">Session Slot</div>
            <div className="text-sm font-medium">{formattedDate}</div>
            <div className="text-xl font-serif text-primary mt-0.5">{booking.time}</div>
          </div>

          <div className="flex flex-col gap-2 w-full">
            {booking.status === 'pending' && (
              <>
                <button
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, 'confirmed')}
                  className="w-full h-10 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Accept
                </button>
                <button
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, 'rejected')}
                  className="w-full h-10 rounded-xl bg-white border border-primary/10 text-primary/50 text-xs font-bold uppercase tracking-wider hover:text-red-500 hover:border-red-200 transition-all disabled:opacity-50"
                >
                  Decline
                </button>
              </>
            )}
            
            {booking.status === 'confirmed' && (
              <>
                <button
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, 'completed')}
                  className="w-full h-10 rounded-xl bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wider hover:bg-green-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 border border-green-200"
                >
                  {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Mark Completed
                </button>
                <button
                  disabled={isProcessing}
                  onClick={() => onUpdateStatus(booking.id, 'cancelled')}
                  className="w-full h-10 rounded-xl bg-white border border-primary/10 text-primary/50 text-xs font-bold uppercase tracking-wider hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div >
  )
}


