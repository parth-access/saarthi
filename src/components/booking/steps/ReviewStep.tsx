import * as React from "react"
import { format, parseISO } from "date-fns"
import { ChevronLeft, Loader2, AlertCircle } from "lucide-react"
import { Button } from "../../ui/Button"

import { Therapist } from "../../../types"

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
    age: string | number;
    message?: string;
  };
  therapists: Therapist[];
  onConfirm: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}

export const ReviewStep = ({ data, therapists, onConfirm, onBack, submitting, error }: Props) => {
  const selectedTherapist = therapists.find(t => t.id === data.therapistId)
  
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

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary">Final Review</h3>
        <p className="text-muted-foreground mt-2">Take a moment to check your session details</p>
      </div>
      
      <div className="bg-[#FFFBE7] border-2 border-primary/5 rounded-[3rem] p-8 sm:p-10 space-y-8 shadow-sm">
        <div className="flex items-center gap-6 pb-8 border-b border-primary/5">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white shadow-md bg-white">
             <img src={selectedTherapist?.image} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
             <p className="text-[10px] uppercase font-black tracking-[0.2em] text-accent mb-1">Your Specialist</p>
             <h4 className="text-2xl font-serif font-bold text-primary">{selectedTherapist?.name}</h4>
             <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">{selectedTherapist?.specialization}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-8 text-sm text-primary">
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Session Focus</p>
            <p className="font-serif text-lg font-bold">{data.sessionType} Session</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Chosen Slot</p>
            <p className="font-serif text-lg font-bold">
              {data.date && format(parseISO(data.date), "dd MMM")} at {formatTime12h(data.time)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Your Name</p>
            <p className="font-serif text-lg font-bold">{data.name}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Contact Info</p>
            <p className="font-serif text-lg font-bold truncate">{data.email}</p>
            <p className="text-sm font-medium opacity-80">{data.phone}</p>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      <div className="flex justify-between pt-6">
        <Button variant="ghost" className="rounded-full" onClick={onBack} disabled={submitting}><ChevronLeft className="mr-2 h-4 w-4" /> Go Back</Button>
        <Button 
          className="px-16 h-16 rounded-full text-lg shadow-2xl shadow-primary/20" 
          disabled={submitting} 
          onClick={onConfirm}
        >
          {submitting ? <Loader2 className="animate-spin h-6 w-6" /> : "Confirm Session Request"}
        </Button>
      </div>
    </div>
  );
};
