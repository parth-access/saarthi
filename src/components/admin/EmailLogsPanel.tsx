"use client";


import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Loader2, 
  Search, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Calendar
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { resendService } from "@/services/resendService";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface EmailAttempt {
  attemptNumber: number;
  attemptedAt: string;
  status: "success" | "failed";
  error?: string;
  response?: { id?: string } | null;
}

interface EmailLog {
  id: string;
  bookingId: string;
  type: string;
  recipient: string;
  subject: string;
  status: "queued" | "sending" | "sent" | "failed" | "delivered";
  attempts: EmailAttempt[];
  createdAt: string;
  updatedAt: string;
  html?: string;
  text?: string;
}

export const EmailLogsPanel = () => {
  const [logs, setLogs] = React.useState<EmailLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);
  const [resendingId, setResendingId] = React.useState<string | null>(null);
  const [resendSuccessId, setResendSuccessId] = React.useState<string | null>(null);

  const fetchLogs = React.useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await resendService.getEmailLogs();
      setLogs(data || []);
    } catch (err) {
      console.error("Error fetching email logs:", err);
      setError("Failed to load email delivery logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleResend = async (emailId: string) => {
    try {
      setResendingId(emailId);
      setResendSuccessId(null);
      await resendService.resendEmail(emailId);
      setResendSuccessId(emailId);
      await fetchLogs();
      setTimeout(() => setResendSuccessId(null), 3000);
    } catch (err) {
      console.error("Resend error:", err);
      alert(err instanceof Error ? err.message : "Failed to resend email");
    } finally {
      setResendingId(null);
    }
  };

  const filteredLogs = React.useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.bookingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || log.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [logs, searchTerm, statusFilter]);

  const stats = React.useMemo(() => {
    const total = logs.length;
    const sent = logs.filter(l => l.status === "sent").length;
    const failed = logs.filter(l => l.status === "failed").length;
    const pending = logs.filter(l => l.status === "queued" || l.status === "sending").length;
    return { total, sent, failed, pending };
  }, [logs]);

  return (
    <div className="space-y-8 text-left animate-in fade-in duration-500 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif text-primary tracking-tight">Email Operations Center</h2>
          <p className="text-sm text-primary/60 mt-1">
            Real-time delivery lifecycle tracking, attempt audit trails, and manual re-dispatch mechanics.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchLogs}
          disabled={loading}
          className="rounded-2xl h-12 px-6 flex items-center gap-2 border-primary/10 hover:bg-primary/5 cursor-pointer"
        >
          <RefreshCw className={cn("w-4 h-4 text-primary/60", loading && "animate-spin")} />
          Reload logs
        </Button>
      </div>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FCFAF7] border border-primary/5 rounded-3xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.01)]">
          <div className="text-xs font-bold uppercase tracking-widest text-primary/40 mb-1">Total Emails Tracked</div>
          <div className="text-3xl font-serif text-primary font-medium">{stats.total}</div>
        </div>
        <div className="bg-green-50/40 border border-green-100 rounded-3xl p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-green-700/60 mb-1">Delivered / Sent</div>
          <div className="text-3xl font-serif text-green-700 font-medium">{stats.sent}</div>
        </div>
        <div className="bg-red-50/40 border border-red-100 rounded-3xl p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-red-700/60 mb-1">Failed Deliveries</div>
          <div className="text-3xl font-serif text-red-700 font-medium">{stats.failed}</div>
        </div>
        <div className="bg-amber-50/40 border border-amber-100 rounded-3xl p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-amber-700/60 mb-1">Queued / Active</div>
          <div className="text-3xl font-serif text-amber-700 font-medium">{stats.pending}</div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="bg-white border border-primary/5 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
          <input 
            type="text"
            placeholder="Search by recipient, subject, booking ID, or message type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-xl bg-[#FCFAF7] border-none focus:ring-2 focus:ring-primary/10 transition-all font-medium text-sm placeholder:font-normal placeholder:text-primary/30 outline-none"
          />
        </div>
        <div className="relative group min-w-[180px]">
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-12 rounded-xl bg-[#FCFAF7] border-none px-4 pr-10 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/10 appearance-none transition-all cursor-pointer outline-none"
          >
            <option value="all">All Delivery States</option>
            <option value="sent">Sent / Delivered</option>
            <option value="failed">Failed</option>
            <option value="queued">Queued</option>
            <option value="sending">Sending</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40 pointer-events-none" />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* LOGS LIST */}
      <div className="space-y-4">
        {loading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-primary/40 gap-4 bg-[#FCFAF7] rounded-[2rem] border border-primary/5">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm font-medium">Querying Firestore telemetry...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-primary/40 gap-3 bg-[#FCFAF7] rounded-[2rem] border border-primary/5">
            <Mail className="w-8 h-8 stroke-[1.5]" />
            <p className="text-sm font-medium">No email delivery transactions found matching the filter.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div 
                key={log.id} 
                className={cn(
                  "border rounded-[2rem] transition-all bg-white shadow-sm overflow-hidden text-left",
                  isExpanded ? "border-primary/20 shadow-md" : "border-primary/5 hover:border-primary/10"
                )}
              >
                {/* HEADER / SUMMARY BOX */}
                <div 
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border",
                      log.status === "sent" ? "bg-green-50/50 border-green-100 text-green-600" :
                      log.status === "failed" ? "bg-red-50/50 border-red-100 text-red-600" :
                      log.status === "sending" ? "bg-blue-50/50 border-blue-100 text-blue-600 animate-pulse" :
                      "bg-amber-50/50 border-amber-100 text-amber-600"
                    )}>
                      {log.status === "sent" ? <CheckCircle2 className="w-5 h-5" /> :
                       log.status === "failed" ? <AlertCircle className="w-5 h-5" /> :
                       log.status === "sending" ? <Loader2 className="w-5 h-5 animate-spin" /> :
                       <Clock className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-bold text-primary text-base">{log.recipient}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-primary/5 text-primary/60 border border-primary/5">
                          {log.type}
                        </span>
                      </div>
                      <div className="text-sm text-primary/70 mt-1 font-medium">{log.subject}</div>
                      <div className="text-xs text-primary/40 mt-1.5 flex items-center gap-2 font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        {log.createdAt ? format(parseISO(log.createdAt), "MMM d, yyyy 'at' hh:mm a") : "Pending timestamp"}
                        <span>•</span>
                        <span className="font-mono text-[10px]">Doc: {log.id}</span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">Booking: {log.bookingId}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end md:self-center">
                    <div className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest border",
                      log.status === "sent" ? "bg-green-50 text-green-700 border-green-100" :
                      log.status === "failed" ? "bg-red-50 text-red-700 border-red-100" :
                      log.status === "sending" ? "bg-blue-50 text-blue-700 border-blue-100" :
                      "bg-amber-50 text-amber-700 border-amber-100"
                    )}>
                      {log.status}
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-primary/30" /> : <ChevronDown className="w-5 h-5 text-primary/30" />}
                  </div>
                </div>

                {/* EXPANDABLE DETAIL SHEET */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="border-t border-primary/5 bg-[#FCFAF7]/40 overflow-hidden"
                    >
                      <div className="p-6 md:p-8 space-y-6">
                        {/* ATTEMPTS TELEMETRY AUDIT */}
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-widest text-primary/50 mb-3">Attempt Dispatch History</h4>
                          {log.attempts && log.attempts.length > 0 ? (
                            <div className="space-y-3">
                              {log.attempts.map((attempt, idx) => (
                                <div 
                                  key={idx}
                                  className="bg-white border border-primary/5 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.01)]"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-primary">Attempt #{attempt.attemptNumber}</span>
                                      <span className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md",
                                        attempt.status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                                      )}>
                                        {attempt.status}
                                      </span>
                                    </div>
                                    <div className="text-xs text-primary/40 font-medium">
                                      {format(parseISO(attempt.attemptedAt), "MMM d, yyyy 'at' hh:mm:ss a")}
                                    </div>
                                    {attempt.error && (
                                      <div className="text-xs text-red-600 font-mono bg-red-50/50 p-2 rounded-lg border border-red-100/40 mt-1 max-w-xl">
                                        Error: {attempt.error}
                                      </div>
                                    )}
                                    {attempt.response ? (
                                      <div className="text-[10px] font-mono text-primary/60 bg-primary/5 p-2 rounded-lg mt-1 max-w-xl">
                                        Resend ID: {attempt.response.id || JSON.stringify(attempt.response)}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-primary/40 italic">No delivery attempts recorded yet.</p>
                          )}
                        </div>

                        {/* RENDERED BODY SNAPSHOT */}
                        {log.text && (
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-primary/50 mb-2">Plaintext Backup Message</h4>
                            <div className="bg-white border border-primary/5 rounded-2xl p-4 text-xs text-primary/70 font-mono whitespace-pre-wrap leading-relaxed">
                              {log.text}
                            </div>
                          </div>
                        )}

                        {/* RESEND TRIGGER BUTTON */}
                        <div className="flex items-center justify-end border-t border-primary/5 pt-6 gap-3">
                          {resendSuccessId === log.id && (
                            <span className="text-xs font-semibold text-green-600 flex items-center gap-1.5 animate-bounce">
                              <CheckCircle2 className="w-4 h-4" />
                              Re-queued & Dispatched Successfully!
                            </span>
                          )}
                          <Button
                            onClick={() => handleResend(log.id)}
                            disabled={resendingId !== null}
                            className="rounded-xl h-11 px-5 bg-primary hover:bg-primary/95 text-white flex items-center gap-2 cursor-pointer text-xs tracking-wide"
                          >
                            {resendingId === log.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Processing Re-send...
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                Resend Email Now
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
