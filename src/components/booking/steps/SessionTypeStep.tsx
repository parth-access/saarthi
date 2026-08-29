import * as React from "react"
import { ChevronLeft, User, HeartHandshake, Users, Sparkles } from "lucide-react"
import { Button } from "../../ui/Button"
import { SessionType } from "../../../types"
import { cn } from "../../../lib/utils"

// TODO: If differential pricing is introduced per session type or age-gating for Teen sessions,
// ensure DetailsStep/ReviewStep re-validates the order amount and eligibility from the server.
interface SessionTypeOption {
  type: SessionType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SESSION_TYPE_OPTIONS: SessionTypeOption[] = [
  {
    type: "Individual",
    title: "Individual",
    description: "One-on-one personalized therapy for personal growth and emotional wellbeing.",
    icon: User,
  },
  {
    type: "Couple",
    title: "Couple",
    description: "Navigate relationship dynamics, communication, and mutual understanding.",
    icon: HeartHandshake,
  },
  {
    type: "Family",
    title: "Family",
    description: "Strengthen interpersonal bonds and address collective household challenges.",
    icon: Users,
  },
  {
    type: "Teen",
    title: "Teen",
    description: "Tailored mental health support and emotional guidance for adolescents (13–19).",
    icon: Sparkles,
  },
]

interface Props {
  selected: SessionType | "";
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
        {SESSION_TYPE_OPTIONS.map(({ type, title, description, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className={cn(
              "p-6 rounded-[2rem] border-2 text-left transition-all group flex flex-col gap-3",
              selected === type 
                ? "border-primary bg-primary/5 text-primary shadow-lg shadow-primary/5 ring-2 ring-primary/10" 
                : "border-muted/30 bg-white hover:border-primary/20 hover:bg-[#FFFBE7]/40 text-muted-foreground"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                selected === type ? "bg-primary text-white" : "bg-primary/5 text-primary group-hover:bg-primary/10"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn(
                "text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full",
                selected === type ? "bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground"
              )}>
                {type}
              </span>
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-serif font-bold text-primary">{title} Therapy</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="flex pt-4">
        <Button variant="ghost" className="rounded-full hover:bg-primary/5" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    </div>
  );
};
