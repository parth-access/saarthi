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
        <div className="text-center py-16 bg-muted/5 rounded-[2rem] border-2 border-dashed border-muted/50">
          <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-30" />
          <p className="font-serif text-xl text-muted-foreground/60">No slots available for this day.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {slots.map(slot => {
            const isLoading = lockingTime === slot.time
            const isAnyLoading = !!lockingTime

            return (
              <button
                key={slot.time}
                disabled={!slot.isAvailable || isAnyLoading}
                onClick={() => onSelect(slot.time)}
                className={cn(
                  "p-5 rounded-2xl border-2 text-sm font-bold transition-all relative overflow-hidden active:scale-95",
                  !slot.isAvailable ? "bg-muted/30 border-muted/10 opacity-30 cursor-not-allowed" :
                  isLoading ? "bg-primary text-white border-primary shadow-xl" : 
                  "bg-white border-muted/30 hover:border-primary/40 hover:bg-primary/5",
                  isAnyLoading && !isLoading && "opacity-50"
                )}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Checking...</span>
                  </div>
                ) : formatTime12h(slot.time)}
                {!slot.isAvailable && slot.reason && (
                  <div className="absolute inset-x-0 bottom-0 py-0.5 bg-muted text-[8px] font-black uppercase text-center">
                    {slot.reason}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
      
      <div className="flex pt-4">
        <Button variant="ghost" className="rounded-full" onClick={onBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
      </div>
    </div>
  );
};
