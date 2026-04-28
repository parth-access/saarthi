import * as React from "react"
import { format, addDays, startOfToday } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../../ui/Button"
import { cn } from "../../../lib/utils"

interface Props {
  selectedDate: string;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const DateStep = ({ selectedDate, onSelect, onNext, onBack }: Props) => {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary">Preferred Date</h3>
        <p className="text-muted-foreground mt-2">Choose a day that works for you</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(14)].map((_, i) => {
          const day = addDays(startOfToday(), i)
          const dateStr = format(day, "yyyy-MM-dd")
          const isSelected = selectedDate === dateStr
          return (
            <button
              key={dateStr}
              onClick={() => onSelect(dateStr)}
              className={cn(
                "p-6 rounded-2xl border-2 flex flex-col items-center transition-all",
                isSelected 
                  ? "bg-primary text-white border-primary shadow-xl scale-105" 
                  : "bg-white border-muted/30 hover:bg-primary/5"
              )}
            >
              <span className="text-[10px] uppercase font-black tracking-widest opacity-60 mb-2">{format(day, "EEE")}</span>
              <span className="text-2xl font-serif font-bold">{format(day, "dd")}</span>
              <span className="text-sm font-medium opacity-80">{format(day, "MMM")}</span>
            </button>
          )
        })}
      </div>
      <div className="flex justify-between pt-4">
        <Button variant="ghost" className="rounded-full" onClick={onBack}><ChevronLeft className="mr-2 h-4 w-4" /> Back</Button>
        <Button 
          disabled={!selectedDate} 
          onClick={onNext}
          className="rounded-full px-8"
        >
          Find Slots <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
