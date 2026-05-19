import * as React from "react"
import { Loader2, ShieldCheck, AlertCircle, ChevronRight } from "lucide-react"
import { Therapist } from "../../../types"
import { useTherapists } from "../../../hooks/useTherapists"
import { cn } from "../../../lib/utils"
import { Skeleton } from "../../ui/Skeleton"

interface Props {
  selectedId: string;
  onSelect: (therapistId: string) => void;
}

export const TherapistStep = ({ selectedId, onSelect }: Props) => {
  const { therapists, loading, error } = useTherapists();

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
           <Skeleton className="h-10 w-64 mx-auto rounded-xl mb-4" />
           <Skeleton className="h-5 w-80 mx-auto rounded-lg" />
        </div>
        <div className="grid gap-6">
          {[1, 2].map((i) => (
             <div key={i} className="p-6 rounded-[2.5rem] border-2 border-primary/5 bg-white flex flex-col sm:flex-row items-center gap-6">
               <Skeleton className="w-24 h-24 rounded-full shrink-0" />
               <div className="flex-1 space-y-3 w-full">
                  <Skeleton className="h-6 w-48 rounded-lg" />
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <div className="space-y-2 mt-4">
                    <Skeleton className="h-3 w-full rounded-md" />
                    <Skeleton className="h-3 w-3/4 rounded-md" />
                  </div>
               </div>
               <Skeleton className="hidden sm:block w-8 h-8 rounded-full" />
             </div>
          ))}
        </div>
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
                ? "border-[#E6A520] bg-white ring-4 ring-[#E6A520]/10 shadow-sm" 
                : "border-muted/30 bg-white hover:border-primary/20 hover:bg-[#FFFBE7]"
            )}
          >
            <div className="w-24 h-24 rounded-full overflow-hidden shrink-0 border-2 border-primary/10 bg-primary/5 flex items-center justify-center text-primary font-serif text-3xl">
              {t.image ? (
                <img src={t.image} alt={t.name} referrerPolicy="no-referrer" className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105" />
              ) : (
                t.name.charAt(0)
              )}
            </div>
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <h4 className="text-xl font-serif text-primary font-bold group-hover:text-[#E6A520] transition-colors">{t.name}</h4>
              <p className="text-sm font-medium text-[#E6A520] uppercase tracking-wider">{t.specialization}</p>
              <p className="text-xs text-primary/60 line-clamp-2 leading-relaxed">{t.bio}</p>
            </div>
            <div className={`hidden sm:flex w-10 h-10 items-center justify-center rounded-full transition-colors ${selectedId === t.id ? 'bg-[#E6A520] text-white' : 'bg-primary/5 text-primary group-hover:bg-[#E6A520]/20 group-hover:text-primary'}`}>
              <ChevronRight className="w-5 h-5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
