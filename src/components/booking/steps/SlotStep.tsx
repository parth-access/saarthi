import * as React from "react"
import { format, parseISO } from "date-fns"
import { Calendar, Loader2, Clock, AlertCircle, ChevronLeft } from "lucide-react"
import { Button } from "../../ui/Button"
import { useAvailability } from "../../../hooks/useAvailability"
import { cn } from "../../../lib/utils"

interface Props {
  therapistId: string;
  date: string;
  onSelect: (time: string) => void;
  onBack: () => void;
  lockingTime: string | null;
}

export const SlotStep = ({ therapistId, date, onSelect, onBack, lockingTime }: Props) => {
  const { slots, loading, error } = useAvailability(therapistId, date);

  const formatTime12h = (time24: string) => {
    try {
      const [hours, minutes] = time24.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const h12 = hours % 12 || 12
      return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`
    } catch (e) {
      return time24
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="font-serif italic text-primary/60">Checking the specialist's availability...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary">Available Slots</h3>
        <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
          <Calendar className="w-4 h-4" /> {date ? format(parseISO(date), "MMMM dd, yyyy") : ""}
        </p>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-3 text-sm font-medium">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {slots.length === 0 ? (
        <div className="text-center py-16 bg-[#FAFAFA] rounded-[2rem] border border-primary/5">
          <Clock className="w-10 h-10 text-primary/20 mx-auto mb-4" />
          <p className="font-serif text-xl text-primary/40 tracking-tight">No availability on this day.</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 max-w-2xl mx-auto justify-center">
          {slots.map(slot => {
            const isLoading = lockingTime === slot.time
            const isAnyLoading = !!lockingTime

            return (
              <button
                key={slot.time}
                disabled={!slot.isAvailable || isAnyLoading}
                onClick={() => onSelect(slot.time)}
                className={cn(
                  "px-6 py-3.5 rounded-full border text-sm font-bold transition-all relative overflow-hidden active:scale-95 group",
                  !slot.isAvailable ? "bg-muted/10 border-transparent text-primary/30 cursor-not-allowed" :
                  isLoading ? "bg-[#E6A520] text-white border-[#E6A520] shadow-md shadow-[#E6A520]/20" : 
                  "bg-white border-primary/10 text-primary hover:border-[#E6A520]/40 hover:text-[#E6A520] hover:bg-[#FFFBE7]",
                  isAnyLoading && !isLoading && "opacity-50"
                )}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reserving...</span>
                  </div>
                ) : formatTime12h(slot.time)}
                {!slot.isAvailable && slot.reason && (
                  <span className="ml-2 text-[10px] font-black uppercase text-primary/20 group-hover:text-primary/30">
                    {slot.reason}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      
      <div className="flex pt-4 justify-center">
        <Button variant="ghost" className="rounded-full hover:bg-primary/5 text-primary/60 font-bold text-xs uppercase tracking-widest" onClick={onBack}>
          <ChevronLeft className="mr-2 h-3.5 w-3.5" /> Select Different Date
        </Button>
      </div>
    </div>
  );
};
