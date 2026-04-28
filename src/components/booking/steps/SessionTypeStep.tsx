import * as React from "react"
import { ChevronLeft } from "lucide-react"
import { Button } from "../../ui/Button"
import { SessionType } from "../../../types"
import { cn } from "../../../lib/utils"

const SESSION_TYPES: SessionType[] = ["Individual", "Couple", "Family", "Teen"]

interface Props {
  selected: string;
  onSelect: (type: SessionType) => void;
  onBack: () => void;
}

export const SessionTypeStep = ({ selected, onSelect, onBack }: Props) => {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary">Session Type</h3>
        <p className="text-muted-foreground mt-2">What kind of support are you looking for?</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SESSION_TYPES.map(type => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            className={cn(
              "p-8 rounded-[2rem] border-2 text-center transition-all hover:scale-[1.02] active:scale-100",
              selected === type 
                ? "border-primary bg-primary/5 text-primary shadow-xl shadow-primary/5" 
                : "border-muted/30 bg-white text-muted-foreground"
            )}
          >
            <span className="text-xl font-serif font-bold">{type}</span>
          </button>
        ))}
      </div>
      <div className="flex pt-4">
        <Button variant="ghost" className="rounded-full" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    </div>
  );
};
