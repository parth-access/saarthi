import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, AlertCircle, ShieldCheck, Info } from 'lucide-react';
import { Booking } from '@/types';
import { computeRefundPercent } from '@/domains/payment/RefundPolicy';
import { sessionStartMs, formatSessionTimeRange } from '@/lib/sessionDisplay';
import { toast } from 'sonner';

interface CancelModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Booking | null;
  /** Called after a successful server-side cancellation. */
  onCancelled?: (result: { outcome: string; refundPercent: number; refundEnqueued: boolean }) => void;
}

/**
 * Client cancellation dialog.
 *
 * Shows an honest, policy-accurate refund preview (computed client-side with the
 * SAME pure `computeRefundPercent` the server uses) before the user confirms.
 * The refund percent shown here is indicative — the server recomputes it inside
 * the transaction at cancel time and is authoritative. Only paid+confirmed
 * bookings are eligible for a refund; pending/unpaid bookings are simply
 * withdrawn with nothing to refund.
 */
export function CancelModal({ isOpen, onClose, session, onCancelled }: CancelModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const isPaid = session?.paymentStatus === 'paid';

  const refundPercent = useMemo(() => {
    if (!session || !isPaid) return 0;
    return computeRefundPercent(sessionStartMs(session), Date.now());
  }, [session, isPaid]);

  const handleSubmit = async () => {
    if (!session) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/bookings/cancel-self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: session.id, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(
          data.refundEnqueued
            ? `Session cancelled. A ${data.refundPercent}% refund has been initiated.`
            : 'Your session has been cancelled.'
        );
        onCancelled?.({ outcome: data.outcome, refundPercent: data.refundPercent, refundEnqueued: data.refundEnqueued });
        onClose();
      } else {
        setError(data.error || 'We could not cancel this session right now. Please try again.');
      }
    } catch {
      setError('Something went wrong while cancelling. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && session && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-title"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
          >
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-primary/10">
              <div className="flex items-center justify-between p-6 border-b border-primary/5 bg-[#FFFBE7]/50">
                <div>
                  <h3 id="cancel-title" className="text-xl font-serif text-primary">Cancel Session</h3>
                  <p className="text-xs text-primary/60 font-sans mt-1">
                    {session.date} · {formatSessionTimeRange(session.time)}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-primary/40 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
                  aria-label="Close cancel dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 font-sans">
                {/* Refund preview */}
                {isPaid ? (
                  <div className={`flex items-start gap-3 rounded-2xl p-4 border ${
                    refundPercent === 100
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                      : refundPercent === 50
                      ? 'bg-amber-50 border-amber-100 text-amber-800'
                      : 'bg-gray-50 border-gray-100 text-gray-600'
                  }`}>
                    <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm leading-relaxed">
                      {refundPercent > 0 ? (
                        <>Based on our cancellation policy, you are eligible for a <strong>{refundPercent}% refund</strong>. It will be initiated automatically to your original payment method.</>
                      ) : (
                        <>As this session is within 24 hours, it is <strong>not eligible for a refund</strong> per our cancellation policy.</>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-2xl p-4 border bg-[#FFFBE7]/60 border-primary/10 text-primary/70">
                    <Info className="w-5 h-5 shrink-0 mt-0.5 text-[#E6A520]" />
                    <div className="text-sm leading-relaxed">
                      No payment has been captured for this session, so there is nothing to refund. This will simply withdraw your request.
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="cancel-reason" className="block text-sm font-medium text-primary mb-2">
                    Reason <span className="text-primary/40 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="cancel-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    placeholder="Let us know why, if you'd like to…"
                    className="w-full rounded-2xl border border-primary/20 bg-white px-4 py-3 text-sm text-primary placeholder:text-primary/30 focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10 resize-none"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                  </div>
                )}
              </div>

              <div className="flex gap-3 p-6 border-t border-primary/5 bg-white font-sans">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 text-sm font-medium text-primary border border-primary/20 hover:bg-primary/5 rounded-2xl transition-all disabled:opacity-50"
                >
                  Keep session
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-2xl transition-all shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <React.Fragment>
                      <Loader2 className="w-4 h-4 animate-spin" /> Cancelling…
                    </React.Fragment>
                  ) : (
                    'Cancel session'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
