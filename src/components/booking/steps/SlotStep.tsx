import * as React from "react"
import { format, parseISO } from "date-fns"
import { Calendar, Loader2, Clock, AlertCircle, ChevronLeft, RefreshCw, Globe } from "lucide-react"
import { Button } from "../../ui/Button"
import { useAvailability } from "../../../hooks/useAvailability"
import { cn } from "../../../lib/utils"
import { formatTime12h, slotTone, SLOT_TONE_LABEL, type SlotTone } from "../bookingUi"

interface Props {
  therapistId: string;
  date: string;
  onSelect: (time: string) => void;
  onBack: () => void;
  lockingTime: string | null;
}

/** Pill styling per availability tone. Disabled state is driven by isAvailable, not by tone. */
const TONE_PILL: Record<SlotTone, string> = {
  available: "bg-white border-primary/10 text-primary hover:border-accent/40 hover:text-accent hover:bg-background",
  booked: "bg-danger-surface border-transparent text-danger/70",
  locked: "bg-warning-surface border-transparent text-warning",
  past: "bg-muted/20 border-transparent text-primary/30 line-through decoration-primary/20",
  beyond: "bg-muted/20 border-transparent text-primary/40",
};

/** Legend swatch colour per tone. */
const TONE_DOT: Record<SlotTone, string> = {
  available: "bg-success",
  booked: "bg-danger/60",
  locked: "bg-warning",
  past: "bg-muted-foreground/40",
  beyond: "bg-info/60",
};

const LEGEND_TONES: SlotTone[] = ["available", "booked", "locked", "past", "beyond"];

function SlotLegend() {
  return (
    <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {LEGEND_TONES.map((tone) => (
        <span key={tone} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", TONE_DOT[tone])} />
          {SLOT_TONE_LABEL[tone]}
        </span>
      ))}
    </div>
  );
}

export const SlotStep = ({ therapistId, date, onSelect, onBack, lockingTime }: Props) => {
  const { slots, loading, error, refetch } = useAvailability(therapistId, date);

  // Past-slot detection is decided by the server against IST (see
  // /api/availability + @/shared/scheduling/slots) and arrives as `slot.reason`.
  // It deliberately does NOT re-derive "now" from the browser clock here: that
  // copy of the rule lived only in this component, so every other consumer of
  // useAvailability silently lacked it, and a skewed or non-IST device clock
  // disagreed with the validation the booking command then applied.

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary motion-reduce:animate-none" />
        <p className="font-serif italic text-primary/60">{"Checking the specialist's availability..."}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h3 className="font-serif text-3xl text-primary">Available Slots</h3>
          <p className="mt-2 flex items-center justify-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" /> {date ? format(parseISO(date), "MMMM dd, yyyy") : ""}
          </p>
        </div>

        <div className="mx-auto max-w-lg space-y-4 rounded-[2rem] border border-danger/20 bg-danger-surface p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-danger opacity-80" />
          <div className="space-y-1">
            <h4 className="font-serif text-lg font-bold text-primary">Unable to Check Slots</h4>
            <p className="text-sm text-danger">{error}</p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              className="gap-2 rounded-full border-primary/20 px-6 hover:bg-primary hover:text-white"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </Button>
            <Button variant="ghost" onClick={onBack} className="rounded-full px-5 text-primary/70 hover:bg-primary/5">
              Pick Another Date
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h3 className="font-serif text-3xl text-primary">Available Slots</h3>
        <p className="flex items-center justify-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4" /> {date ? format(parseISO(date), "MMMM dd, yyyy") : ""}
        </p>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary/70">
          <Globe className="h-3 w-3" />
          <span>All times in IST (Indian Standard Time · UTC+5:30)</span>
        </div>
      </div>

      {slots.length === 0 ? (
        <div className="space-y-4 rounded-[2rem] border border-primary/5 bg-neutral-surface py-16 text-center">
          <Clock className="mx-auto h-10 w-10 text-primary/20" />
          <div className="space-y-1">
            <p className="font-serif text-xl tracking-tight text-primary/60">No availability on this day.</p>
            <p className="text-xs text-muted-foreground">All slots are either booked or outside the specialist&apos;s working hours.</p>
          </div>
          <Button
            variant="outline"
            onClick={onBack}
            className="mt-2 rounded-full border-primary/20 px-6 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white"
          >
            Choose Another Date
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <SlotLegend />
          <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-3">
            {slots.map(slot => {
              const isLoading = lockingTime === slot.time
              const isAnyLoading = !!lockingTime
              const isAvailable = slot.isAvailable
              const tone = slotTone(slot.reason, isAvailable)

              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!isAvailable || isAnyLoading}
                  onClick={() => onSelect(slot.time)}
                  aria-label={isAvailable ? `Select ${formatTime12h(slot.time)}` : `${formatTime12h(slot.time)} — ${SLOT_TONE_LABEL[tone]}`}
                  className={cn(
                    "relative overflow-hidden rounded-full border px-6 py-3.5 text-sm font-bold transition-all active:scale-95",
                    isLoading ? "border-accent bg-accent text-white shadow-md shadow-accent/20" : TONE_PILL[tone],
                    !isAvailable && "cursor-not-allowed",
                    isAnyLoading && !isLoading && "opacity-50",
                  )}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                      <span>Reserving...</span>
                    </span>
                  ) : (
                    <span>{formatTime12h(slot.time)}</span>
                  )}
                  {!isAvailable && !isLoading && (
                    <span className="ml-2 text-[10px] font-black uppercase tracking-wider opacity-70">
                      {SLOT_TONE_LABEL[tone]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-center pt-4">
        <Button variant="ghost" className="rounded-full text-xs font-bold uppercase tracking-widest text-primary/60 hover:bg-primary/5" onClick={onBack}>
          <ChevronLeft className="mr-2 h-3.5 w-3.5" /> Select Different Date
        </Button>
      </div>
    </div>
  );
};
