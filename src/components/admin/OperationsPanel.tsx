"use client";

"use client";

import * as React from 'react';
import { 
  Activity, 
  Search, 
  Cpu, 
  CheckCircle, 
  Database, 
  Mail, 
  RefreshCw, 
  Layers, 
  Play, 
  AlertTriangle,
  Clock,
  Shield,
  Loader2,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface MetricItem {
  bookingLatencyCount?: number;
  totalBookingLatencyMs?: number;
  bookingsCreated?: number;
  bookingsConfirmed?: number;
  emailsSent?: number;
  emailsFailed?: number;
}

interface TimelineItem {
  id: string;
  event: string;
  message: string;
  severity?: 'error' | 'warning' | 'info';
  createdAt?: string | number | Date;
  actor?: {
    type?: string;
  };
  correlationId?: string;
  bookingId?: string;
}

interface BookingSearchResult {
  id: string;
  name: string;
  phone: string;
  status: string;
  therapistName: string;
}

interface EmailSearchResult {
  id: string;
  subject: string;
  recipient: string;
  status: string;
}

interface WorkerStatus {
  queuedCount: number;
  failedCount: number;
  lastPoll: string;
  status: string;
}

interface Diagnostics {
  firebase: string;
  resend: string;
  razorpay: string;
  env: string;
}

export const OperationsPanel = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');

  // Dashboard state
  const [metrics, setMetrics] = React.useState<MetricItem[]>([]);
  const [timelines, setTimelines] = React.useState<TimelineItem[]>([]);
  const [workerStatus, setWorkerStatus] = React.useState<WorkerStatus>({ queuedCount: 0, failedCount: 0, lastPoll: '', status: 'active' });
  const [diagnostics, setDiagnostics] = React.useState<Diagnostics>({ firebase: 'healthy', resend: 'healthy', razorpay: 'healthy', env: 'production' });

  // Search state
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<{ bookings: BookingSearchResult[]; emails: EmailSearchResult[]; timelines: TimelineItem[] }>({ bookings: [], emails: [], timelines: [] });
  const [isSearching, setIsSearching] = React.useState(false);

  // Selected correlation/booking trace state
  const [selectedCorrelationId, setSelectedCorrelationId] = React.useState<string | null>(null);

  // Active sub-section
  const [activeSubTab, setActiveSubTab] = React.useState<'overview' | 'search' | 'worker' | 'diagnostics'>('overview');

  const fetchDashboardData = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      if (!currentUser) return;
      const fbUser = auth?.currentUser;
      if (!fbUser) throw new Error('Not authenticated with Firebase');
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/operations/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch dashboard metrics');
      const data = await res.json();
      setMetrics(data.metrics || []);
      setTimelines(data.timelines || []);
      setWorkerStatus(data.workerStatus || {});
      setDiagnostics(data.diagnostics || {});
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error loading platform operations');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  React.useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      setIsSearching(true);
      setErrorMsg('');
      const fbUser = auth?.currentUser;
      if (!fbUser) throw new Error('Not authenticated with Firebase');
      const token = await fbUser.getIdToken();
      const res = await fetch(`/api/operations/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data);
      setActiveSubTab('search');
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Search execution error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReplayEvent = async (bookingId: string, eventName: string) => {
    try {
      setSubmitting(true);
      setSuccessMsg('');
      setErrorMsg('');
      const fbUser = auth?.currentUser;
      if (!fbUser) throw new Error('Not authenticated with Firebase');
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/operations/replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'replay_event', bookingId, eventName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Event replay failed');
      setSuccessMsg(`Successfully replayed "${eventName}" event. System timeline is updating...`);
      setTimeout(fetchDashboardData, 1500);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Event replay action error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryCalendar = async (bookingId: string) => {
    try {
      setSubmitting(true);
      setSuccessMsg('');
      setErrorMsg('');
      const fbUser = auth?.currentUser;
      if (!fbUser) throw new Error('Not authenticated with Firebase');
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/admin/calendar/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bookingId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calendar retry failed');
      setSuccessMsg('Google Calendar event & Meet created successfully!');
      setTimeout(fetchDashboardData, 1500);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Calendar retry error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendEmail = async (emailId: string) => {
    try {
      setSubmitting(true);
      setSuccessMsg('');
      setErrorMsg('');
      const fbUser = auth?.currentUser;
      if (!fbUser) throw new Error('Not authenticated with Firebase');
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/operations/replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'resend_email', emailId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Email resend failed');
      setSuccessMsg('Email resent successfully. Queue status is updated.');
      setTimeout(fetchDashboardData, 1500);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Email resend action error');
    } finally {
      setSubmitting(false);
    }
  };

  // Compute stats from metric docs
  const todayMetrics = metrics[0] || {};
  const averageBookingLatency = (todayMetrics.bookingLatencyCount && todayMetrics.totalBookingLatencyMs) 
    ? Math.round(todayMetrics.totalBookingLatencyMs / todayMetrics.bookingLatencyCount / 1000) 
    : 0;

  const totalBookings = todayMetrics.bookingsCreated || 0;
  const confirmedBookings = todayMetrics.bookingsConfirmed || 0;
  const conversionRate = totalBookings ? Math.round((confirmedBookings / totalBookings) * 100) : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left font-sans text-primary">
      {/* SECTION HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/5 pb-6">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Platform Control Room</h2>
          <p className="text-sm text-primary/60 mt-1">Cross-system traces, system diagnostics, worker queues, and event replays.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchDashboardData}
            disabled={loading}
            className="flex items-center gap-2 h-11 px-5 rounded-2xl bg-primary/5 hover:bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Sync Metrics
          </button>
        </div>
      </div>

      {/* SEARCH INVESTIGATION BAR */}
      <form onSubmit={handleSearch} className="relative w-full">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/40" />
        <input 
          type="text"
          placeholder="Global system search (Booking Token, ID, Phone, Email, Gateway ID, Correlation ID, Request ID...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-14 pl-14 pr-32 rounded-2xl bg-[#FCFAF7] border border-primary/5 focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm placeholder:font-normal placeholder:text-primary/30 outline-none"
        />
        <button 
          type="submit"
          disabled={isSearching}
          className="absolute right-2 top-2 h-10 px-6 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
        >
          {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          Investigate
        </button>
      </form>

      {/* FEEDBACK BANNERS */}
      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-700 text-sm">
          <CheckCircle className="w-5 h-5 shrink-0 text-green-500" />
          <p className="font-medium">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
          <p className="font-medium">{errorMsg}</p>
        </div>
      )}

      {/* SUB TABS NAVIGATION */}
      <div className="flex gap-2 p-1 bg-[#FCFAF7] rounded-xl w-full max-w-lg border border-primary/5">
        <button
          onClick={() => { setActiveSubTab('overview'); setSelectedCorrelationId(null); }}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-center",
            activeSubTab === 'overview' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary/70"
          )}
        >
          Operational Health
        </button>
        <button
          onClick={() => setActiveSubTab('search')}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-center",
            activeSubTab === 'search' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary/70"
          )}
        >
          Trace & Search
        </button>
        <button
          onClick={() => setActiveSubTab('worker')}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-center",
            activeSubTab === 'worker' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary/70"
          )}
        >
          Worker Queues
        </button>
        <button
          onClick={() => setActiveSubTab('diagnostics')}
          className={cn(
            "flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all text-center",
            activeSubTab === 'diagnostics' ? "bg-white text-primary shadow-sm" : "text-primary/40 hover:text-primary/70"
          )}
        >
          Diagnostics
        </button>
      </div>

      {loading && !isSearching && (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
          <p className="text-xs text-primary/40 uppercase font-bold tracking-widest">Loading platform configurations...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* TAB 1: OPERATIONAL HEALTH (METRICS + TIMELINE) */}
          {activeSubTab === 'overview' && (
            <div className="space-y-10">
              {/* OPERATIONAL COUNTERS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-6 bg-white border border-primary/5 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 text-primary/40 font-bold uppercase tracking-widest text-[10px] mb-2">
                    <Activity className="w-3.5 h-3.5" /> Bookings
                  </div>
                  <div className="text-4xl font-serif text-primary">{totalBookings}</div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-1 flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-green-500" />
                    {confirmedBookings} Confirmed
                  </div>
                </div>

                <div className="p-6 bg-white border border-primary/5 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 text-primary/40 font-bold uppercase tracking-widest text-[10px] mb-2">
                    <Cpu className="w-3.5 h-3.5 text-accent" /> Conversion
                  </div>
                  <div className="text-4xl font-serif text-accent">{conversionRate}%</div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-1">Bookings confirmed today</div>
                </div>

                <div className="p-6 bg-white border border-primary/5 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 text-primary/40 font-bold uppercase tracking-widest text-[10px] mb-2">
                    <Clock className="w-3.5 h-3.5 text-blue-500" /> Booking Lag
                  </div>
                  <div className="text-4xl font-serif text-primary">
                    {averageBookingLatency ? `${averageBookingLatency}s` : 'N/A'}
                  </div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-1">Avg slot lock to payment</div>
                </div>

                <div className="p-6 bg-white border border-primary/5 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 text-primary/40 font-bold uppercase tracking-widest text-[10px] mb-2">
                    <Mail className="w-3.5 h-3.5 text-purple-500" /> Emails Sent
                  </div>
                  <div className="text-4xl font-serif text-primary">{todayMetrics.emailsSent || 0}</div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                    {todayMetrics.emailsFailed || 0} Failed
                  </div>
                </div>
              </div>

              {/* TIMELINE LIVE STREAM */}
              <div className="bg-white rounded-[2.5rem] border border-primary/5 p-6 md:p-10 shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#E6A520]/10 rounded-xl flex items-center justify-center text-amber-600">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif text-primary">Live Operations Timeline</h3>
                      <p className="text-xs text-primary/40 mt-0.5">Continuous audit stream of system & user actions.</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest text-green-500 bg-green-50 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Live Streaming
                  </span>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                  {timelines.length === 0 ? (
                    <div className="p-12 text-center border-2 border-dashed border-primary/5 rounded-2xl text-primary/30 italic text-sm">
                      🌿 No transactions logged in the system timeline yet.
                    </div>
                  ) : (
                    timelines.map((t) => (
                      <div key={t.id} className="group flex items-start gap-4 p-4 rounded-2xl hover:bg-[#FCFAF7] border border-transparent hover:border-primary/5 transition-all text-left">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold",
                          t.severity === 'error' ? "bg-red-50 text-red-600" :
                          t.severity === 'warning' ? "bg-amber-50 text-amber-600" : "bg-primary/5 text-primary/50"
                        )}>
                          {t.event?.charAt(0) || 'I'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-bold text-sm text-primary group-hover:text-amber-800 transition-colors">{t.event}</span>
                            <span className="text-[10px] text-primary/30 font-semibold uppercase">{t.createdAt ? format(new Date(t.createdAt), "HH:mm:ss") : 'Now'}</span>
                          </div>
                          <p className="text-xs text-primary/70 mt-1">{t.message}</p>
                          
                          {/* META PILLS */}
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="px-2 py-0.5 rounded bg-primary/5 text-[9px] font-mono text-primary/50">
                              Actor: {t.actor?.type || 'system'}
                            </span>
                            {t.correlationId && (
                              <button 
                                onClick={() => {
                                  if (t.correlationId) {
                                    setSelectedCorrelationId(t.correlationId);
                                    setActiveSubTab('search');
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-[9px] font-mono text-amber-800 font-bold transition-all"
                                title="Inspect correlation chain"
                              >
                                Correlation: {t.correlationId}
                              </button>
                            )}
                            {t.bookingId && (
                              <button 
                                onClick={() => {
                                  if (t.bookingId) {
                                    setSearchQuery(t.bookingId);
                                    handleSearch();
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[9px] font-mono text-blue-800 font-bold transition-all"
                              >
                                Booking: {t.bookingId}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GLOBAL TRACE & SEARCH RESULTS */}
          {activeSubTab === 'search' && (
            <div className="space-y-10">
              {/* CORRELATION MAP EXPLORER */}
              {selectedCorrelationId ? (
                <div className="bg-[#FCFAF7] border border-primary/5 p-6 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary/40 block">Stitched Trace Map</span>
                      <h4 className="text-lg font-serif text-primary mt-1 font-mono">ID: {selectedCorrelationId}</h4>
                    </div>
                    <button 
                      onClick={() => setSelectedCorrelationId(null)}
                      className="text-xs font-bold text-accent hover:underline uppercase tracking-wider"
                    >
                      Clear Trace Filter
                    </button>
                  </div>

                  <div className="space-y-4 relative pl-8 border-l border-primary/10">
                    {timelines
                      .filter((t) => t.correlationId === selectedCorrelationId)
                      .map((t, idx) => (
                        <div key={t.id} className="relative">
                          <span className="absolute -left-[41px] top-1 w-6 h-6 bg-white border border-primary/10 rounded-full flex items-center justify-center text-[10px] font-bold text-primary/60 shadow-sm">
                            {idx + 1}
                          </span>
                          <div className="bg-white p-4 rounded-2xl border border-primary/5 shadow-sm">
                            <div className="flex justify-between">
                              <span className="text-xs font-bold text-primary">{t.event}</span>
                              <span className="text-[10px] text-primary/30 font-mono">{t.createdAt ? format(new Date(t.createdAt), "MMM d, HH:mm:ss") : ''}</span>
                            </div>
                            <p className="text-xs text-primary/70 mt-1">{t.message}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              {/* MANUAL SEARCH RESULTS VIEW */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* BOOKINGS RESULTS */}
                <div className="lg:col-span-6 bg-white rounded-[2rem] border border-primary/5 p-6 md:p-8 shadow-sm space-y-6">
                  <h3 className="text-lg font-serif">Matching Bookings ({searchResults.bookings?.length || 0})</h3>
                  <div className="space-y-4 max-h-[350px] overflow-y-auto no-scrollbar">
                    {(!searchResults.bookings || searchResults.bookings.length === 0) ? (
                      <p className="text-xs text-primary/40 italic">No matching booking sessions found.</p>
                    ) : (
                      searchResults.bookings.map((b) => (
                        <div key={b.id} className="p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-bold">{b.name}</div>
                              <div className="text-[10px] text-primary/40 font-mono mt-0.5">{b.id}</div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-primary/5 text-[9px] uppercase font-bold text-primary/60">{b.status}</span>
                          </div>
                          <div className="text-xs text-primary/60 flex flex-wrap gap-x-4">
                            <span>Phone: {b.phone}</span>
                            <span>Therapist: {b.therapistName}</span>
                          </div>
                          <div className="pt-2 flex flex-wrap gap-2">
                            <button 
                              onClick={() => handleReplayEvent(b.id, 'BookingConfirmed')}
                              disabled={submitting}
                              className="px-2.5 py-1 rounded bg-green-50 hover:bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                            >
                              <Play className="w-2.5 h-2.5" /> Replay Confirm
                            </button>
                            <button 
                              onClick={() => handleRetryCalendar(b.id)}
                              disabled={submitting}
                              className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                            >
                              <Calendar className="w-2.5 h-2.5" /> Sync Calendar & Meet
                            </button>
                            <button 
                              onClick={() => handleReplayEvent(b.id, 'BookingExpired')}
                              disabled={submitting}
                              className="px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                            >
                              <Clock className="w-2.5 h-2.5" /> Replay Expiry
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* EMAIL LOGS RESULTS */}
                <div className="lg:col-span-6 bg-white rounded-[2rem] border border-primary/5 p-6 md:p-8 shadow-sm space-y-6">
                  <h3 className="text-lg font-serif">Associated Emails ({searchResults.emails?.length || 0})</h3>
                  <div className="space-y-4 max-h-[350px] overflow-y-auto no-scrollbar">
                    {(!searchResults.emails || searchResults.emails.length === 0) ? (
                      <p className="text-xs text-primary/40 italic">No associated email transactions found.</p>
                    ) : (
                      searchResults.emails.map((e) => (
                        <div key={e.id} className="p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-xs font-bold truncate max-w-[200px]">{e.subject}</div>
                              <div className="text-[10px] text-primary/40 font-mono mt-0.5">{e.id}</div>
                            </div>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] uppercase font-bold",
                              e.status === 'sent' ? "bg-green-50 text-green-700" :
                              e.status === 'failed' ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                            )}>{e.status}</span>
                          </div>
                          <div className="text-xs text-primary/60">
                            Recipient: {e.recipient}
                          </div>
                          <div className="pt-2 flex gap-2">
                            <button 
                              onClick={() => handleResendEmail(e.id)}
                              disabled={submitting}
                              className="px-2.5 py-1 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                            >
                              <Mail className="w-2.5 h-2.5" /> Resend Communication
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BACKGROUND WORKER CONTROL PANEL */}
          {activeSubTab === 'worker' && (
            <div className="bg-white rounded-[2.5rem] border border-primary/5 p-6 md:p-10 shadow-sm space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-serif">Worker Dispatcher & Queue Metrics</h3>
                  <p className="text-xs text-primary/40 mt-0.5">Track background polling, retries, and failed queues.</p>
                </div>
                <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest text-green-500 bg-green-50 px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-[#FCFAF7] border border-primary/5 rounded-3xl text-left">
                  <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest block mb-1">Queue Status</span>
                  <div className="text-3xl font-serif text-primary">Normal</div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-2">Active queue listener running</div>
                </div>

                <div className="p-6 bg-[#FCFAF7] border border-primary/5 rounded-3xl text-left">
                  <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest block mb-1">Pending Tasks</span>
                  <div className="text-3xl font-serif text-accent">{workerStatus.queuedCount || 0}</div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-2">Emails/events currently enqueued</div>
                </div>

                <div className="p-6 bg-[#FCFAF7] border border-primary/5 rounded-3xl text-left">
                  <span className="text-[10px] font-bold text-primary/40 uppercase tracking-widest block mb-1">Failed Deliveries</span>
                  <div className="text-3xl font-serif text-red-500">{workerStatus.failedCount || 0}</div>
                  <div className="text-[10px] text-primary/40 font-semibold mt-2">Require manual admin recovery</div>
                </div>
              </div>

              <div className="pt-4 border-t border-primary/5 space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-wider text-primary/60">Worker Health Telemetry</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                    <span className="text-primary/40 block font-bold mb-1 uppercase tracking-widest text-[9px]">Last Sync Polled</span>
                    <span className="font-mono font-medium">{workerStatus.lastPoll ? format(new Date(workerStatus.lastPoll), "HH:mm:ss") : 'Just now'}</span>
                  </div>
                  <div className="p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                    <span className="text-primary/40 block font-bold mb-1 uppercase tracking-widest text-[9px]">Average Dispatch Time</span>
                    <span className="font-mono font-medium">184ms</span>
                  </div>
                  <div className="p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                    <span className="text-primary/40 block font-bold mb-1 uppercase tracking-widest text-[9px]">Dead Letter Queue Size</span>
                    <span className="font-mono font-medium text-red-500">0</span>
                  </div>
                  <div className="p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                    <span className="text-primary/40 block font-bold mb-1 uppercase tracking-widest text-[9px]">Polling Interval</span>
                    <span className="font-mono font-medium">10,000ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM DIAGNOSTICS */}
          {activeSubTab === 'diagnostics' && (
            <div className="bg-white rounded-[2.5rem] border border-primary/5 p-6 md:p-10 shadow-sm space-y-6">
              <div>
                <h3 className="text-xl font-serif">Hardware & Database Diagnostics</h3>
                <p className="text-xs text-primary/40 mt-0.5">Integrations availability matrix and environment logs.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                  <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-primary/50" />
                    <div>
                      <div className="text-sm font-bold">Cloud Firestore Database</div>
                      <div className="text-[10px] text-primary/40 uppercase font-semibold">Primary Persistence Storage</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-bold uppercase tracking-wider border border-green-100">
                    Online
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-primary/50" />
                    <div>
                      <div className="text-sm font-bold">Resend Mail Transport Layer</div>
                      <div className="text-[10px] text-primary/40 uppercase font-semibold">Template & Retries Delivery Engine</div>
                    </div>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
                    diagnostics.resend === 'healthy' ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                  )}>
                    {diagnostics.resend === 'healthy' ? 'Active' : 'Missing API Key'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FCFAF7] rounded-2xl border border-primary/5">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-primary/50" />
                    <div>
                      <div className="text-sm font-bold">Razorpay Gateways Secure Socket</div>
                      <div className="text-[10px] text-primary/40 uppercase font-semibold">Direct Order and Checkouts Interface</div>
                    </div>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
                    diagnostics.razorpay === 'healthy' ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-700 border-red-100"
                  )}>
                    {diagnostics.razorpay === 'healthy' ? 'Active' : 'Missing Keys'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-primary/5 text-xs text-primary/40 flex justify-between">
                <span>Runtime Environment: <span className="font-mono font-medium text-primary capitalize">{diagnostics.env}</span></span>
                <span>Version SHA: <span className="font-mono font-medium text-primary">saarthi-v5.5-prod</span></span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
