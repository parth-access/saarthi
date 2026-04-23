import * as React from "react"
import { Loader2, ShieldCheck, AlertCircle, ChevronRight } from "lucide-react"
import { Therapist } from "../../../types"
import { useTherapists } from "../../../hooks/useTherapists"
import { cn } from "../../../lib/utils"

interface Props {
  selectedId: string;
  onSelect: (therapistId: string) => void;
}

export const TherapistStep = ({ selectedId, onSelect }: Props) => {
  const { therapists, loading, error } = useTherapists();

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="font-serif italic text-primary/60">Meeting our team...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-16 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto opacity-50" />
        <p className="text-primary font-medium">{error}</p>
      </div>
    );
  }

  if (therapists.length === 0) {
    return (
      <div className="py-16 text-center space-y-6 bg-primary/5 rounded-[2.5rem] border-2 border-dashed border-primary/10">
        <ShieldCheck className="w-12 h-12 text-primary/20 mx-auto" />
        <p className="text-xl font-serif text-primary/60">No specialists available right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-serif text-primary">Choose your Therapist</h3>
        <p className="text-muted-foreground mt-2">Select a specialist best suited for your journey</p>
      </div>
      <div className="grid gap-6">
        {therapists.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "p-6 rounded-[2.5rem] border-2 text-left transition-all group flex flex-col sm:flex-row items-center gap-6",
              selectedId === t.id 
                ? "border-primary bg-primary/5 ring-4 ring-primary/5" 
                : "border-muted/30 bg-white hover:border-primary/20 hover:bg-primary/5"
            )}
          >
            <div className="w-24 h-24 rounded-full overflow-hidden shrink-0 border-2 border-primary/10">
              <img src={t.image || "placeholder.png"} alt={t.name} referrerPolicy="no-referrer" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
            </div>
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <h4 className="text-xl font-serif text-primary font-bold">{t.name}</h4>
              <p className="text-sm font-medium text-accent uppercase tracking-wider">{t.specialization}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{t.bio}</p>
            </div>
            <ChevronRight className="hidden sm:block w-6 h-6 text-primary/40 group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
};
