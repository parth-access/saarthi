import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Clock, Video, CreditCard, Activity, FileText, UserCog } from 'lucide-react';
import { Booking, Therapist } from '@/types';
import Image from 'next/image';

interface SessionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Booking | null;
  therapist: Therapist | undefined;
  onReschedule: () => void;
}

export function SessionDetailsModal({ isOpen, onClose, session, therapist, onReschedule }: SessionDetailsModalProps) {
  if (!session) return null;

  const isFuture = new Date(`${session.date}T${session.time}`) > new Date();

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
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-primary/10"
          >
            <div className="flex items-center justify-between p-6 border-b border-primary/5 bg-[#FFFBE7]/30">
              <h3 className="text-xl font-serif text-primary">Session Details</h3>
              <button
                onClick={onClose}
                className="p-2 text-primary/40 hover:text-primary transition-colors hover:bg-black/5 rounded-full"
                aria-label="Close details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Status & Basic Info */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-widest text-[#E6A520] font-bold">
                    {session.sessionType} Session
                  </span>
                  <span className={`px-3 py-1 text-xs rounded-full uppercase tracking-wider font-medium ${
                    session.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' :
                    session.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                    session.status.includes('pending') ? 'bg-blue-50 text-blue-600' :
                    session.status === 'rejected' ? 'bg-red-50 text-red-600' :
                    session.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                    'bg-primary/5 text-primary'
                  }`}>
                    {session.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-primary/40 font-mono">ID: {session.id}</p>
              </div>

              {/* Therapist Info */}
              <div className="bg-[#FFFBE7]/50 rounded-2xl p-5 border border-primary/5 flex items-center gap-4">
                {therapist?.image ? (
                  <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0">
                    <Image src={therapist.image} alt={therapist.name} fill className="object-cover" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif text-xl shrink-0">
                    {therapist?.name.charAt(0) || 'T'}
                  </div>
                )}
                <div>
                  <h4 className="font-medium text-lg text-primary">{therapist?.name || 'Assigned Therapist'}</h4>
                  <p className="text-sm text-primary/60">{therapist?.specialization || 'Therapist'}</p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-primary/10 rounded-2xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
                  <Calendar className="w-5 h-5 text-primary/40 mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-xs text-primary/40 uppercase tracking-wider mb-0.5">Date</p>
                  <p className="font-medium text-primary">{session.date}</p>
                </div>
                <div className="bg-white border border-primary/10 rounded-2xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
                  <Clock className="w-5 h-5 text-primary/40 mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-xs text-primary/40 uppercase tracking-wider mb-0.5">Time</p>
                  <p className="font-medium text-primary">{session.time}</p>
                </div>
                <div className="bg-white border border-primary/10 rounded-2xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
                  <Video className="w-5 h-5 text-primary/40 mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-xs text-primary/40 uppercase tracking-wider mb-0.5">Mode</p>
                  <p className="font-medium text-primary capitalize">{session.sessionMode || 'Video Call'}</p>
                </div>
                <div className="bg-white border border-primary/10 rounded-2xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 group">
                  <CreditCard className="w-5 h-5 text-primary/40 mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-xs text-primary/40 uppercase tracking-wider mb-0.5">Payment</p>
                  <p className={`font-medium capitalize ${session.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-[#E6A520]'}`}>
                    {session.paymentStatus || 'Unpaid'}
                  </p>
                </div>
              </div>

              {/* Patient Message */}
              {session.message && (
                <div>
                  <h4 className="text-sm font-medium text-primary mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary/60" /> Your Message
                  </h4>
                  <div className="bg-primary/5 rounded-2xl p-4 text-sm text-primary/80 whitespace-pre-wrap flex flex-col max-h-[200px] overflow-y-auto">
                    {session.message}
                  </div>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="p-6 border-t border-primary/5 bg-[#FFFBE7]/30 space-y-3">
              {isFuture && (session.status === 'confirmed' || session.status === 'pending') && (
                <button
                  onClick={() => {
                    onClose();
                    onReschedule();
                  }}
                  className="w-full py-3 text-sm font-medium text-[#E6A520] border border-[#E6A520]/20 hover:bg-[#E6A520]/5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
                >
                  Request Reschedule
                </button>
              )}
              {session.paymentStatus !== 'paid' && session.status !== 'cancelled' && session.status !== 'rejected' && (
                <a
                  href={`/payment?token=${session.bookingToken || session.id}`}
                  className="flex items-center justify-center w-full py-3 px-4 bg-[#E6A520] hover:bg-[#E6A520]/90 text-white rounded-2xl font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
                >
                  Complete Payment
                </a>
              )}
              <a
                href={`mailto:support@saarthilife.com?subject=Re: Session ${session.id}`}
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-primary/60 hover:text-primary transition-all duration-200 hover:bg-primary/5 rounded-2xl group"
              >
                <UserCog className="w-4 h-4 group-hover:scale-110 transition-transform" /> Contact Support
              </a>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
