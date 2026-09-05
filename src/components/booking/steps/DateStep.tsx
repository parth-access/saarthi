import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../../ui/Button"
import { cn } from "../../../lib/utils"
import { BOOKING_WINDOW_DAYS } from "../../../shared/constants"
import { istDatePlusDays } from "../../../shared/scheduling/slots"

interface Props {
  selectedDate: string;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const DateStep = ({ selectedDate, onSelect, onNext, onBack }: Props) => {
  /**
   * The offered days are IST calendar days, not the browser's. Availability
   * rules, the booking window and the server's validation are all expressed in
   * IST, so a device in another timezone (or with a skewed clock) would otherwise
   * offer a day that has already passed in IST — and label the wrong day "Today".
   *
   * Labels are formatted with `timeZone: 'UTC'` from a UTC-midnight anchor, so no
   * local offset can shift the rendered day back or forward either.
   */
  const days = React.useMemo(() => {
    const now = new Date()
    return [...Array(BOOKING_WINDOW_DAYS)].map((_, i) => {
      const dateStr = istDatePlusDays(i, now)
      const [y, m, d] = dateStr.split('-').map(Number)
      const anchor = new Date(Date.UTC(y, m - 1, d))
      const fmt = (options: Intl.DateTimeFormatOptions) =>
        anchor.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })

      let label = fmt({ weekday: 'short' })
      if (i === 0) label = "Today"
      else if (i === 1) label = "Tomorrow"

      return {
        dateStr,
        label,
        dayNum: fmt({ day: '2-digit' }),
        monthShort: fmt({ month: 'short' }),
      }
    })
  }, [])

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary tracking-tight">Preferred Date</h3>
        <p className="text-muted-foreground mt-2 text-sm italic">Choose a day that works for you</p>
      </div>

      <div className="relative">
        <div
          role="group"
          aria-label="Choose a date within the next two weeks"
          className="flex overflow-x-auto gap-4 pb-6 pt-4 snap-x snap-mandatory no-scrollbar w-full px-4 sm:px-0 -mx-4 sm:mx-0 mask-edges"
        >
          {days.map(({ dateStr, label, dayNum, monthShort }) => {
            const isSelected = selectedDate === dateStr

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onSelect(dateStr)}
                aria-pressed={isSelected}
                aria-label={`${label}, ${dayNum} ${monthShort}`}
                className={cn(
                  "snap-center shrink-0 w-28 py-5 rounded-[2rem] border transition-all duration-300 flex flex-col items-center justify-center relative overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isSelected
                    ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105"
                    : "bg-white border-primary/5 hover:border-primary/20 hover:bg-background text-primary"
                )}
              >
                {/* Subtle highlight effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 to-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest mb-1 transition-colors",
                  isSelected ? "text-white/70" : "text-primary/40"
                )}>
                  {label}
                </span>
                <span className="text-3xl font-serif font-medium tracking-tight mb-1">
                  {dayNum}
                </span>
                <span className={cn(
                  "text-xs font-semibold transition-colors",
                   isSelected ? "text-white/80" : "text-primary/50"
                )}>
                  {monthShort}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-center text-[11px] font-medium text-muted-foreground sm:text-right">
          Scroll for more dates · next {BOOKING_WINDOW_DAYS} days
        </p>
      </div>

      <div className="flex justify-between pt-4 border-t border-primary/5">
        <Button variant="ghost" className="rounded-full hover:bg-primary/5" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button
          variant="accent"
          disabled={!selectedDate}
          onClick={onNext}
          className="rounded-full px-8 font-bold tracking-wide"
        >
          Find Slots <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
