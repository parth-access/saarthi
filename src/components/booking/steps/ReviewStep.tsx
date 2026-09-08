import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, Loader2, AlertCircle, Clock, RotateCcw } from "lucide-react"
import { Button } from "../../ui/Button"

import { Therapist } from "../../../types"
import { CONFIRM_CTA_LABEL, SHARED_SUMMARY_LAYOUT_ID, SHARED_CARD_TRANSITION } from "../bookingUi"
import { BookingSummary } from "../BookingSummary"

export type BookingFlowState = 
  | 'IDLE'
  | 'SUBMITTING_BOOKING'
  | 'PAYMENT_OPEN'
  | 'PAYMENT_PROCESSING'
  | 'VERIFYING_PAYMENT'
  | 'CONFIRMED'
  | 'ERROR';

interface Props {
  data: {
    therapistId: string;
    sessionType: string;
    date: string;
    time: string;
    name: string;
    email: string;
    phone: string;
    gender: string;
    age: string;
    message?: string;
    consent?: boolean;
  };
  therapists: Therapist[];
  onConfirm: () => void;
  onBack: () => void;
  onJumpToSlots?: () => void;
  submitting: boolean;
  bookingFlowState?: BookingFlowState;
  error: string | null;
}

export const ReviewStep = ({ 
  data, 
  therapists, 
  onConfirm, 
  onBack, 
  onJumpToSlots,
  submitting, 
  bookingFlowState = 'IDLE', 
  error 
}: Props) => {
  const selectedTherapist = therapists.find(t => t.id === data.therapistId)
  const reduce = useReducedMotion()

  const isBusy = submitting || (bookingFlowState !== 'IDLE' && bookingFlowState !== 'ERROR');

  const isLockExpiredError = error && (
    error.toLowerCase().includes('lock') || 
    error.toLowerCase().includes('expired') || 
    error.toLowerCase().includes('available') || 
    error.toLowerCase().includes('conflict')
  );
  
  const getButtonContent = () => {
    if (bookingFlowState === 'VERIFYING_PAYMENT') {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin h-5 w-5 motion-reduce:animate-none" />
          <span>Confirming Booking...</span>
        </span>
      );
    }
    if (bookingFlowState === 'PAYMENT_OPEN' || bookingFlowState === 'PAYMENT_PROCESSING') {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin h-5 w-5 motion-reduce:animate-none" />
          <span>Payment in Progress...</span>
        </span>
      );
    }
    if (submitting || bookingFlowState === 'SUBMITTING_BOOKING') {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin h-5 w-5 motion-reduce:animate-none" />
          <span>Initiating Payment...</span>
        </span>
      );
    }
    return CONFIRM_CTA_LABEL;
  };

  // The shared card carries itself via layoutId; everything around it (header,
  // hold banner, actions) staggers in shortly after it settles. Disabled under
  // reduced motion.
  const stagger = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.35, ease: "easeOut" as const },
        };

  return (
    <div className="space-y-6 sm:space-y-8">
      <motion.div {...stagger(0.15)} className="text-center space-y-2">
        <h3 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-primary">Final Review</h3>
        <p className="text-sm text-muted-foreground">Take a moment to check your session details before payment.</p>
      </motion.div>

      {/* Slot Hold Banner */}
      <motion.div
        {...stagger(0.3)}
        className="flex items-center justify-between gap-3 p-4 bg-warning-surface border border-warning/30 rounded-2xl text-xs text-warning max-w-xl mx-auto shadow-xs"
      >
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Your selected slot is temporarily reserved for <strong>15 minutes</strong>.</span>
        </div>
        <span className="text-[11px] font-semibold text-warning bg-warning/15 px-2 py-0.5 rounded-full shrink-0">Held</span>
      </motion.div>

      {/* The Booking Summary card itself, morphed from the sidebar into the
       * centre via the shared layoutId (see BookingSystem). */}
      <motion.div
        layoutId={reduce ? undefined : SHARED_SUMMARY_LAYOUT_ID}
        initial={reduce ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={reduce ? { duration: 0.2 } : SHARED_CARD_TRANSITION}
        style={{ borderRadius: "2rem" }}
        className="max-w-xl mx-auto"
      >
        <BookingSummary
          variant="review"
          therapist={selectedTherapist}
          sessionType={data.sessionType}
          date={data.date}
          time={data.time}
          client={{
            name: data.name,
            email: data.email,
            phone: data.phone,
            message: data.message,
            consent: data.consent,
          }}
        />
      </motion.div>

      {error && (
        <motion.div {...stagger(0.3)} className="p-4 bg-danger-surface text-danger rounded-2xl border border-danger/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm max-w-xl mx-auto">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-danger" />
            <span>{error}</span>
          </div>
          {isLockExpiredError && onJumpToSlots && (
            <Button
              variant="outline"
              size="sm"
              onClick={onJumpToSlots}
              className="rounded-full bg-white text-danger border-danger/30 hover:bg-danger-surface text-xs font-semibold shrink-0 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Pick Another Slot
            </Button>
          )}
        </motion.div>
      )}

      <motion.div
        {...stagger(0.4)}
        className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 sm:pt-4 max-w-xl mx-auto"
      >
        <Button variant="ghost" className="rounded-full w-full sm:w-auto hover:bg-primary/5" onClick={onBack} disabled={isBusy}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
        <Button
          variant="accent"
          className="px-12 h-14 rounded-full w-full sm:w-auto text-base font-semibold shadow-xl shadow-accent/20 active:scale-95"
          disabled={isBusy}
          onClick={onConfirm}
        >
          {getButtonContent()}
        </Button>
      </motion.div>
    </div>
  );
};
