import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Video, CreditCard, Activity, FileText, UserCog, ChevronDown, Loader2 } from 'lucide-react';
import { Booking, Therapist } from '@/types';
import { normalizeImageUrl } from '@/lib/utils';
import { useJoinSession } from '@/hooks/useJoinSession';
import { formatSessionDate, formatSessionTimeRange, SESSION_DURATION_LABEL, isUpcoming } from '@/lib/sessionDisplay';
import Image from 'next/image';
import { useDialogA11y } from '@/hooks/useDialogA11y';

interface SessionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Booking | null;
  therapist: Therapist | undefined;
  onReschedule: () => void;
  onCancel?: () => void;
}

export function SessionDetailsModal({ isOpen, onClose, session, therapist, onReschedule, onCancel }: SessionDetailsModalProps) {
  const [showTimeline, setShowTimeline] = useState(false);
  const { join, joiningId } = useJoinSession();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y({ isOpen: isOpen && !!session, onClose, panelRef });

  if (!session) return null;

  const isFuture = isUpcoming(session);

  // Determine active step
  const getStepIndex = () => {
    if (session.status === 'cancelled' || session.status === 'rejected') return -1;
    if (session.status === 'completed') return 3;
    if (session.status === 'confirmed') return 2;
    if (session.paymentStatus === 'paid' && session.status === 'pending') return 1;
    return 0; // Booked/Pending
  };

  const activeStep = getStepIndex();
  
  const steps = [
    { title: "Session Requested", desc: "Your booking request was sent." },
    { title: "Payment Complete", desc: "Your session is secured." },
    { title: "Preparation", desc: "Waiting for your session to begin." },
    { title: "Reflection", desc: "Post-session notes and journal." }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <React.Fragment>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-details-title"
            ref={panelRef}
            tabIndex={-1}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-surface shadow-[0_24px_50px_-30px_rgba(19,59,41,0.35)] flex flex-col border-l border-muted overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between p-6 border-b border-muted bg-background/50 relative z-10">
              <h3 id="session-details-title" className="text-xl font-serif text-primary">Your Journey</h3>
              <button
                onClick={onClose}
                className="p-2 text-primary/70 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
                aria-label="Close details"
              >
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 relative z-10">
              
              {/* Session Timeline Expander */}
              {activeStep >= 0 && (
                <div className="bg-background/50 rounded-3xl border border-muted overflow-hidden transition-all">
                  <button 
                    onClick={() => setShowTimeline(!showTimeline)}
                    className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5 text-accent" />
                      <span className="font-medium text-primary">Session Progress</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-primary/70 transition-transform duration-300 ${showTimeline ? 'rotate-180' : ''}`} />
                  </button>
                  
                  <AnimatePresence>
                    {showTimeline && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-5 pb-6"
                      >
                        <div className="relative border-l border-muted ml-4 pl-6 space-y-6 mt-2">
                          {steps.map((step, idx) => {
                            const isCompleted = idx <= activeStep;
                            return (
                              <div key={idx} className="relative">
                                {/* Dot */}
                                <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-2 bg-surface flex items-center justify-center ${
                                  isCompleted ? 'border-accent' : 'border-primary/20'
                                }`}>
                                  {isCompleted && <div className="w-1.5 h-1.5 bg-accent rounded-full" />}
                                </div>
                                <h4 className={`text-sm font-medium ${isCompleted ? 'text-primary' : 'text-primary/70'}`}>
                                  {step.title}
                                </h4>
                                <p className={`text-xs mt-0.5 ${isCompleted ? 'text-muted-foreground' : 'text-primary/70'}`}>
                                  {step.desc}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Status & Basic Info */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-widest text-accent font-bold">
                    {session.sessionType} Session
                  </span>
                  <span className={`px-3 py-1 text-xs rounded-full uppercase tracking-wider font-medium ${
                    session.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    session.status === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    session.status.includes('pending') ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                    session.status === 'rejected' ? 'bg-red-50 text-red-600 border border-red-100' :
                    session.status === 'cancelled' ? 'bg-gray-50 text-gray-500 border border-gray-100' :
                    'bg-primary/5 text-primary border border-muted'
                  }`}>
                    {session.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Therapist Info */}
              <div className="bg-surface rounded-3xl p-5 border border-muted shadow-sm flex items-center gap-4 group cursor-pointer hover:border-muted hover:shadow-md transition-all">
                {therapist?.image ? (
                  <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 border border-muted">
                    <Image src={normalizeImageUrl(therapist.image)} alt={therapist.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-background flex items-center justify-center text-accent font-serif text-xl shrink-0 border border-muted">
                    {therapist?.name.charAt(0) || 'T'}
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-lg text-primary-ink group-hover:text-accent transition-colors">{therapist?.name || 'Assigned Therapist'}</h4>
                  <p className="text-sm text-muted-foreground">{therapist?.specialization || 'Therapist'}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background/30 border border-muted rounded-2xl p-5 hover:bg-surface transition-colors duration-300">
                  <Calendar className="w-5 h-5 text-accent mb-3" />
                  <p className="text-xs text-primary/70 uppercase tracking-wider mb-1 font-medium">Date</p>
                  <p className="font-medium text-primary text-sm">{formatSessionDate(session.date)}</p>
                </div>
                <div className="bg-background/30 border border-muted rounded-2xl p-5 hover:bg-surface transition-colors duration-300">
                  <Clock className="w-5 h-5 text-accent mb-3" />
                  <p className="text-xs text-primary/70 uppercase tracking-wider mb-1 font-medium">Time · {SESSION_DURATION_LABEL}</p>
                  <p className="font-medium text-primary text-sm">{formatSessionTimeRange(session.time)}</p>
                </div>
                <div className="bg-background/30 border border-muted rounded-2xl p-5 hover:bg-surface transition-colors duration-300">
                  <Video className="w-5 h-5 text-accent mb-3" />
                  <p className="text-xs text-primary/70 uppercase tracking-wider mb-1 font-medium">Mode</p>
                  <p className="font-medium text-primary text-sm capitalize">{session.sessionMode || 'Video Call'}</p>
                </div>
                <div className="bg-background/30 border border-muted rounded-2xl p-5 hover:bg-surface transition-colors duration-300">
                  <CreditCard className="w-5 h-5 text-accent mb-3" />
                  <p className="text-xs text-primary/70 uppercase tracking-wider mb-1 font-medium">Payment</p>
                  <p className={`font-medium text-sm capitalize ${session.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-accent'}`}>
                    {session.paymentStatus || 'Unpaid'}
                  </p>
                </div>
              </div>

              {/* Patient Message */}
              {session.message && (
                <div className="bg-surface rounded-3xl p-6 border border-muted shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                  <h4 className="text-sm font-semibold text-primary-ink mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary/70" /> Your Initial Notes
                  </h4>
                  <div className="text-sm text-primary leading-relaxed max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                    {session.message}
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="p-6 border-t border-muted bg-surface space-y-3 relative z-10 shadow-[0_-10px_40px_rgb(0,0,0,0.05)]">
              {session.status === 'confirmed' && (
                <button
                  onClick={() => join(session)}
                  disabled={joiningId === session.id}
                  className="flex items-center justify-center gap-2 w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl font-bold text-sm uppercase tracking-wider transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  {joiningId === session.id ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>
                  ) : (
                    <><Video className="w-4 h-4" /> Join Google Meet Session</>
                  )}
                </button>
              )}
              {isFuture && (session.status === 'confirmed' || session.status === 'pending' || session.status === 'pending_approval') && (
                <button
                  onClick={() => {
                    onClose();
                    onReschedule();
                  }}
                  className="w-full py-3.5 text-sm font-medium text-primary hover:text-white bg-surface hover:bg-primary border border-primary/20 hover:border-primary rounded-2xl transition-all duration-300 shadow-sm"
                >
                  Reschedule
                </button>
              )}
              {onCancel && (session.status === 'confirmed' || session.status === 'pending' || session.status === 'pending_approval' || session.status === 'awaiting_payment') && (
                <button
                  onClick={() => {
                    onClose();
                    onCancel();
                  }}
                  className="w-full py-3 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-2xl transition-all duration-300"
                >
                  Cancel session
                </button>
              )}
              <a
                href={`mailto:support@saarthilife.com?subject=Re: Session ${session.id}`}
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-muted-foreground hover:text-primary transition-colors duration-200"
              >
                <UserCog className="w-4 h-4" /> Need assistance? Contact Support
              </a>
            </div>
            
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-accent/5 rounded-bl-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-tr-full pointer-events-none" />
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
