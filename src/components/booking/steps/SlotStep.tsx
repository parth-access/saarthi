import * as React from "react"
import { format, parseISO } from "date-fns"
import { Calendar, Loader2, Clock, AlertCircle, ChevronLeft, RefreshCw, Globe } from "lucide-react"
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
  const { slots, loading, error, refetch } = useAvailability(therapistId, date);

  const formatTime12h = (time24: string) => {
    try {
      const [hours, minutes] = time24.split(':').map(Number)
      const period = hours >= 12 ? 'PM' : 'AM'
      const h12 = hours % 12 || 12
      return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`
    } catch {
      return time24
    }
  }

  // Calculate IST current date and time for past slot detection
  const istInfo = React.useMemo(() => {
    try {
      const now = new Date();
      const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = istFormatter.formatToParts(now);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      const hour = parts.find(p => p.type === 'hour')?.value;
      const minute = parts.find(p => p.type === 'minute')?.value;
      
      const istDateStr = `${year}-${month}-${day}`;
      const istTimeStr = `${hour}:${minute}`;
      return { istDateStr, istTimeStr, isToday: date === istDateStr };
    } catch {
      return { istDateStr: '', istTimeStr: '', isToday: false };
    }
  }, [date]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="font-serif italic text-primary/60">{"Checking the specialist's availability..."}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <div className="text-center">
          <h3 className="text-3xl font-serif text-primary">Available Slots</h3>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-2">
            <Calendar className="w-4 h-4" /> {date ? format(parseISO(date), "MMMM dd, yyyy") : ""}
          </p>
        </div>

        <div className="p-8 bg-red-50/80 rounded-[2.5rem] border border-red-100 text-center space-y-4 max-w-lg mx-auto shadow-sm">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto opacity-80" />
          <div className="space-y-1">
            <h4 className="font-serif font-bold text-lg text-primary">Unable to Check Slots</h4>
            <p className="text-sm text-red-700/80">{error}</p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Try Again
            </Button>
            <Button
              variant="ghost"
              onClick={onBack}
              className="rounded-full px-5 hover:bg-primary/5 text-primary/70"
            >
              Pick Another Date
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-center space-y-2">
        <h3 className="text-3xl font-serif text-primary">Available Slots</h3>
        <p className="text-muted-foreground flex items-center justify-center gap-2">
          <Calendar className="w-4 h-4" /> {date ? format(parseISO(date), "MMMM dd, yyyy") : ""}
        </p>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-[11px] font-semibold text-primary/70">
          <Globe className="w-3 h-3" />
          <span>All times in IST (Indian Standard Time · UTC+5:30)</span>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="text-center py-16 bg-[#FAFAFA] rounded-[2rem] border border-primary/5 space-y-4">
          <Clock className="w-10 h-10 text-primary/20 mx-auto" />
          <div className="space-y-1">
            <p className="font-serif text-xl text-primary/60 tracking-tight">No availability on this day.</p>
            <p className="text-xs text-muted-foreground">All slots are either booked or outside the specialist's working hours.</p>
          </div>
          <Button
            variant="outline"
            onClick={onBack}
            className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all text-xs font-bold uppercase tracking-wider mt-2"
          >
            Choose Another Date
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 max-w-2xl mx-auto justify-center">
          {slots.map(slot => {
            const isLoading = lockingTime === slot.time
            const isAnyLoading = !!lockingTime
            const isPastSlot = istInfo.isToday && slot.time < istInfo.istTimeStr;
            const isAvailable = slot.isAvailable && !isPastSlot;
            const reasonLabel = isPastSlot ? 'Past' : slot.reason;

            return (
              <button
                key={slot.time}
                type="button"
                disabled={!isAvailable || isAnyLoading}
                onClick={() => onSelect(slot.time)}
                className={cn(
                  "px-6 py-3.5 rounded-full border text-sm font-bold transition-all relative overflow-hidden active:scale-95 group",
                  !isAvailable ? "bg-muted/10 border-transparent text-primary/30 cursor-not-allowed" :
                  isLoading ? "bg-[#E6A520] text-white border-[#E6A520] shadow-md shadow-[#E6A520]/20" : 
                  "bg-white border-primary/10 text-primary hover:border-[#E6A520]/40 hover:text-[#E6A520] hover:bg-[#FFFBE7]",
                  isPastSlot && "opacity-40 line-through decoration-primary/20",
                  isAnyLoading && !isLoading && "opacity-50"
                )}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reserving...</span>
                  </div>
                ) : (
                  <span>{formatTime12h(slot.time)}</span>
                )}
                {!isAvailable && reasonLabel && (
                  <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-primary/25 group-hover:text-primary/35">
                    {reasonLabel}
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
