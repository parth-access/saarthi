import * as React from "react"
import { format, parseISO } from "date-fns"
import { ChevronLeft, Loader2, AlertCircle, ShieldCheck, Clock, CheckCircle2, RotateCcw } from "lucide-react"
import { Button } from "../../ui/Button"

import { Therapist } from "../../../types"

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
  const [imgError, setImgError] = React.useState(false)

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
          <Loader2 className="animate-spin h-5 w-5" />
          <span>Confirming Booking...</span>
        </span>
      );
    }
    if (bookingFlowState === 'PAYMENT_OPEN' || bookingFlowState === 'PAYMENT_PROCESSING') {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin h-5 w-5" />
          <span>Payment in Progress...</span>
        </span>
      );
    }
    if (submitting || bookingFlowState === 'SUBMITTING_BOOKING') {
      return (
        <span className="flex items-center gap-2">
          <Loader2 className="animate-spin h-5 w-5" />
          <span>Initiating Payment...</span>
        </span>
      );
    }
    return "Confirm & Pay ₹1,500";
  };
  
  const formatTime12h = (time24: string) => {
    if (!time24) return "";
    try {
      const [hours, minutes] = time24.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const h12 = hours % 12 || 12
      return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`
    } catch {
      return time24
    }
  }

  const initials = selectedTherapist?.name 
    ? selectedTherapist.name.split(' ').map(n => n[0]).join('').slice(0, 2)
    : 'ST';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-center space-y-2">
        <h3 className="text-3xl font-serif text-primary">Final Review</h3>
        <p className="text-muted-foreground text-sm">Take a moment to check your session details before payment.</p>
      </div>

      {/* Slot Hold Banner */}
      <div className="flex items-center justify-between p-4 bg-amber-50/80 border border-amber-200/60 rounded-2xl text-xs text-amber-900 max-w-xl mx-auto shadow-xs">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-[#E6A520] shrink-0" />
          <span>Your selected slot is temporarily reserved for <strong>15 minutes</strong>.</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">Held</span>
      </div>
      
      <div className="bg-[#FFFBE7] border-2 border-primary/5 rounded-[3rem] p-6 sm:p-10 space-y-8 shadow-sm max-w-2xl mx-auto">
        {/* Specialist Info */}
        <div className="flex items-center gap-5 pb-6 border-b border-primary/10">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md bg-primary/5 shrink-0 flex items-center justify-center font-serif text-2xl font-bold text-primary">
             {!imgError && selectedTherapist?.image ? (
               <img 
                 src={selectedTherapist.image} 
                 alt={selectedTherapist.name || 'Therapist'} 
                 onError={() => setImgError(true)}
                 className="w-full h-full object-cover" 
               />
             ) : (
               <span>{initials}</span>
             )}
          </div>
          <div>
             <p className="text-[10px] uppercase font-black tracking-[0.2em] text-[#E6A520] mb-0.5">Your Specialist</p>
             <h4 className="text-2xl font-serif font-bold text-primary">{selectedTherapist?.name || 'Saarthi Therapist'}</h4>
             <p className="text-xs font-semibold text-primary/60">{selectedTherapist?.specialization || 'Licensed Counselor'}</p>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid sm:grid-cols-2 gap-6 text-sm text-primary">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Session Type</p>
            <p className="font-serif text-base font-bold">{data.sessionType || 'Individual'} Therapy</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Date & Time (IST)</p>
            <p className="font-serif text-base font-bold">
              {data.date && format(parseISO(data.date), "dd MMM, yyyy")} at {formatTime12h(data.time)} <span className="text-xs font-sans font-semibold text-primary/60">IST</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Client Name</p>
            <p className="font-serif text-base font-bold">{data.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Contact Details</p>
            <p className="font-serif text-base font-bold truncate">{data.email}</p>
            <p className="text-xs font-medium text-primary/70">{data.phone}</p>
          </div>
        </div>

        {/* Pricing Commitment Line */}
        <div className="p-4 rounded-2xl bg-white border border-primary/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">Total Amount Payable</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-serif font-bold text-primary">₹1,500</span>
              <span className="text-xs text-muted-foreground font-medium">· 50-minute session</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#1F5E3B] font-semibold bg-[#1F5E3B]/5 px-3 py-1.5 rounded-full border border-[#1F5E3B]/10">
            <ShieldCheck className="w-4 h-4 text-[#1F5E3B]" />
            <span>Rescheduling flexibility included</span>
          </div>
        </div>

        {/* Consent Echo */}
        <div className="pt-2 border-t border-primary/5 flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-[#1F5E3B] shrink-0" />
          <span>You have agreed to Saarthi&apos;s Privacy Policy &amp; confidential therapy terms.</span>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500" /> 
            <span>{error}</span>
          </div>
          {isLockExpiredError && onJumpToSlots && (
            <Button
              variant="outline"
              size="sm"
              onClick={onJumpToSlots}
              className="rounded-full bg-white text-red-600 border-red-200 hover:bg-red-50 text-xs font-bold shrink-0 gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Pick Another Slot
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-between pt-4 max-w-2xl mx-auto">
        <Button variant="ghost" className="rounded-full hover:bg-primary/5" onClick={onBack} disabled={isBusy}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
        <Button 
          className="px-12 h-14 rounded-full text-base font-bold bg-[#E6A520] hover:bg-[#d49419] text-white border-none shadow-xl shadow-[#E6A520]/20 transition-all active:scale-95" 
          disabled={isBusy} 
          onClick={onConfirm}
        >
          {getButtonContent()}
        </Button>
      </div>
    </div>
  );
};
