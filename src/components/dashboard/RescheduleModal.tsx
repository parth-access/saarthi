import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Booking } from '@/types';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Booking | null;
  onSubmit: (reason: string, preferredDate: string, preferredTime: string) => Promise<void>;
}

export function RescheduleModal({ isOpen, onClose, session, onSubmit }: RescheduleModalProps) {
  const [reason, setReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset state when opened
  React.useEffect(() => {
    if (isOpen) {
      setReason('');
      setPreferredDate('');
      setPreferredTime('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for rescheduling.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit(reason, preferredDate, preferredTime);
      onClose();
    } catch (err) {
      setError('Failed to send reschedule request. Please try again.');
    } finally {
      setIsSubmitting(false);
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg origin-center mt-safe p-4 sm:p-0"
          >
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-primary/10">
              <div className="flex items-center justify-between p-6 border-b border-primary/5 bg-[#FFFBE7]/50">
                <h3 className="text-xl font-serif text-primary">Request Reschedule</h3>
                <button
                  onClick={onClose}
                  className="p-2 text-primary/40 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-primary/70 mb-4">
                    Current session: <strong className="text-primary">{session.date} at {session.time}</strong>
                  </p>
                  
                  <label htmlFor="reason" className="block text-sm font-medium text-primary mb-2">
                    Reason for rescheduling <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="reason"
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Please briefly explain why you need to reschedule..."
                    className="w-full rounded-2xl border border-primary/20 bg-white/50 px-4 py-3 text-sm text-primary placeholder:text-primary/30 transition-all duration-200 focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10 hover:border-primary/30 resize-none"
                  />
                  {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pref-date" className="block text-sm font-medium text-primary mb-2">
                      Preferred Date (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <CalendarIcon className="h-4 w-4 text-primary/40" />
                      </div>
                      <input
                        type="date"
                        id="pref-date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        className="w-full rounded-2xl border border-primary/20 bg-white/50 pl-10 pr-4 py-2.5 text-sm text-primary transition-all duration-200 focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10 hover:border-primary/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pref-time" className="block text-sm font-medium text-primary mb-2">
                      Preferred Time (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Clock className="h-4 w-4 text-primary/40" />
                      </div>
                      <input
                        type="time"
                        id="pref-time"
                        value={preferredTime}
                        onChange={(e) => setPreferredTime(e.target.value)}
                        className="w-full rounded-2xl border border-primary/20 bg-white/50 pl-10 pr-4 py-2.5 text-sm text-primary transition-all duration-200 focus:outline-none focus:border-[#E6A520] focus:ring-4 focus:ring-[#E6A520]/10 hover:border-primary/30"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-primary/5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-primary border border-primary/20 bg-transparent hover:bg-primary/5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#E6A520] hover:bg-[#E6A520]/90 rounded-2xl transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:-translate-y-0 disabled:hover:shadow-sm flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <React.Fragment>
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Submitting...
                      </React.Fragment>
                    ) : (
                      'Send Request'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
