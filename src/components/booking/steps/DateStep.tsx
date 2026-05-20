import * as React from "react"
import { format, addDays, startOfToday, isToday, isTomorrow } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "../../ui/Button"
import { cn } from "../../../lib/utils"
import { motion } from "framer-motion"

interface Props {
  selectedDate: string;
  onSelect: (date: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const DateStep = ({ selectedDate, onSelect, onNext, onBack }: Props) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary tracking-tight">Preferred Date</h3>
        <p className="text-muted-foreground mt-2 text-sm italic">Choose a day that works for you</p>
      </div>
      
      <div className="relative">
        <div className="flex overflow-x-auto gap-4 pb-6 pt-4 snap-x snap-mandatory no-scrollbar w-full px-4 sm:px-0 -mx-4 sm:mx-0 mask-edges">
          {[...Array(14)].map((_, i) => {
            const day = addDays(startOfToday(), i)
            const dateStr = format(day, "yyyy-MM-dd")
            const isSelected = selectedDate === dateStr
            
            let label = format(day, "EEE")
            if (isToday(day)) label = "Today"
            else if (isTomorrow(day)) label = "Tomorrow"

            return (
              <button
                key={dateStr}
                onClick={() => onSelect(dateStr)}
                className={cn(
                  "snap-center shrink-0 w-28 py-5 rounded-[2rem] border transition-all duration-300 flex flex-col items-center justify-center relative overflow-hidden group",
                  isSelected 
                    ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105" 
                    : "bg-white border-primary/5 hover:border-primary/20 hover:bg-[#FCFAF7] text-primary"
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
                  {format(day, "dd")}
                </span>
                <span className={cn(
                  "text-xs font-semibold transition-colors",
                   isSelected ? "text-white/80" : "text-primary/50"
                )}>
                  {format(day, "MMM")}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-primary/5">
        <Button variant="ghost" className="rounded-full hover:bg-primary/5" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button 
          disabled={!selectedDate} 
          onClick={onNext}
          className="rounded-full px-8 bg-[#E6A520] hover:bg-[#d49419] text-white border-none shadow-md shadow-[#E6A520]/20 transition-all font-bold tracking-wide"
        >
          Find Slots <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .mask-edges { mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 15px, black calc(100% - 15px), transparent); }
      `}} />
    </div>
  );
};
