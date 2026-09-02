import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar as CalendarIcon, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Booking } from '@/types';
import { useAvailability } from '@/hooks/useAvailability';
import { BOOKING_WINDOW_DAYS } from '@/shared/constants';
import { istDatePlusDays } from '@/shared/scheduling/slots';
import { formatSessionTimeRange, SESSION_DURATION_LABEL } from '@/lib/sessionDisplay';
import { toast } from 'sonner';

interface RescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Booking | null;
  /** Called with the updated booking after a successful server-side reschedule. */
  onRescheduled?: (booking: Partial<Booking> & { id: string }) => void;
}

/**
 * Build the selectable date window: IST today .. IST today + BOOKING_WINDOW_DAYS.
 *
 * The days must be IST calendar days, not the browser's. Saarthi's booking
 * window, the therapist's rules and the server's validation are all expressed in
 * IST, so a device in another timezone (or with a skewed clock) otherwise offers
 * a day that has already passed in IST and omits the last day of the window.
 * The labels are rendered from the same IST date parts for the same reason.
 */
function useDateWindow() {
  return useMemo(() => {
    const days: { iso: string; weekday: string; day: string; month: string }[] = [];
    const now = new Date();
    for (let i = 0; i <= BOOKING_WINDOW_DAYS; i++) {
      const iso = istDatePlusDays(i, now);
      const [y, m, d] = iso.split('-').map(Number);
      // Render the label from the IST date itself, read back in UTC so no local
      // offset is reapplied.
      const labelDate = new Date(Date.UTC(y, m - 1, d));
      days.push({
        iso,
        weekday: labelDate.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
        day: labelDate.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' }),
        month: labelDate.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      });
    }
    return days;
  }, []);
}

export function RescheduleModal({ isOpen, onClose, session, onRescheduled }: RescheduleModalProps) {
  const dateWindow = useDateWindow();
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // `excludeBookingId` keeps this booking from blocking itself: its own slot is
  // held by its own pin and listed among the therapist's active bookings, so
  // without it the client's current time is reported as `Booked` and vanishes
  // from the grid below (which renders available slots only).
  const { slots, loading: slotsLoading, error: slotsError } = useAvailability(
    isOpen && selectedDate ? session?.therapistId ?? null : null,
    isOpen ? selectedDate || null : null,
    isOpen ? session?.id ?? null : null
  );

  // Reset selection whenever the modal (re)opens.
  useEffect(() => {
    if (isOpen) {
      setSelectedDate('');
      setSelectedTime('');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const availableSlots = useMemo(() => slots.filter((s) => s.isAvailable), [slots]);

  const handleSubmit = async () => {
    if (!session || !selectedDate || !selectedTime) {
      setError('Please choose a new date and time for your session.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/bookings/reschedule-self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: session.id, newDate: selectedDate, newTime: selectedTime }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success('Your session has been rescheduled.');
        onRescheduled?.(data.booking ?? { id: session.id, date: selectedDate, time: selectedTime });
        onClose();
      } else {
        setError(data.error || 'We could not reschedule to that slot. Please pick another time.');
      }
    } catch {
      setError('Something went wrong while rescheduling. Please try again.');
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
            aria-labelledby="reschedule-title"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg max-h-[88vh] flex flex-col"
          >
            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-primary/10 flex flex-col max-h-[88vh]">
              <div className="flex items-center justify-between p-6 border-b border-primary/5 bg-[#FFFBE7]/50 shrink-0">
                <div>
                  <h3 id="reschedule-title" className="text-xl font-serif text-primary">Reschedule Session</h3>
                  <p className="text-xs text-primary/60 font-sans mt-1">
                    Currently {session.date} · {formatSessionTimeRange(session.time)}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-primary/40 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
                  aria-label="Close reschedule dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto font-sans">
                {/* Date picker */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-primary mb-3">
                    <CalendarIcon className="w-4 h-4 text-[#E6A520]" /> Choose a new date
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                    {dateWindow.map((d) => {
                      const active = selectedDate === d.iso;
                      return (
                        <button
                          key={d.iso}
                          onClick={() => { setSelectedDate(d.iso); setSelectedTime(''); setError(''); }}
                          className={`shrink-0 w-16 py-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                            active
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-white text-primary/70 border-primary/10 hover:border-[#E6A520]/40 hover:bg-[#FFFBE7]'
                          }`}
                          aria-pressed={active}
                        >
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">{d.weekday}</span>
                          <span className="block text-lg font-semibold leading-tight">{d.day}</span>
                          <span className="block text-[10px] uppercase tracking-wider opacity-70">{d.month}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-primary mb-3">
                      <Clock className="w-4 h-4 text-[#E6A520]" /> Available times
                      <span className="text-xs text-primary/40 font-normal">({SESSION_DURATION_LABEL} session)</span>
                    </label>

                    {slotsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-primary/50 py-6 justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" /> Checking the calendar…
                      </div>
                    ) : slotsError ? (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-2xl p-4">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {slotsError}
                      </div>
                    ) : availableSlots.length === 0 ? (
                      <div className="text-sm text-primary/60 bg-[#FFFBE7]/50 border border-dashed border-primary/15 rounded-2xl p-5 text-center">
                        No open times on this day. Please try another date.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableSlots.map((s) => {
                          const active = selectedTime === s.time;
                          return (
                            <button
                              key={s.time}
                              onClick={() => { setSelectedTime(s.time); setError(''); }}
                              className={`py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer ${
                                active
                                  ? 'bg-[#E6A520] text-white border-[#E6A520] shadow-sm'
                                  : 'bg-white text-primary/80 border-primary/10 hover:border-[#E6A520]/40 hover:bg-[#FFFBE7]'
                              }`}
                              aria-pressed={active}
                            >
                              {s.time}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600" role="alert">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                  </div>
                )}
              </div>

              <div className="flex gap-3 p-6 border-t border-primary/5 bg-white shrink-0 font-sans">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="flex-1 px-4 py-3 text-sm font-medium text-primary border border-primary/20 bg-transparent hover:bg-primary/5 rounded-2xl transition-all disabled:opacity-50"
                >
                  Keep current time
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !selectedDate || !selectedTime}
                  className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-2xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <React.Fragment>
                      <Loader2 className="w-4 h-4 animate-spin" /> Rescheduling…
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <CheckCircle2 className="w-4 h-4" /> Confirm new time
                    </React.Fragment>
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
