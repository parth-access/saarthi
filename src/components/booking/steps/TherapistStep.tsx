import * as React from "react"
import { ShieldCheck, AlertCircle, ChevronRight, RefreshCw } from "lucide-react"
import { useTherapists } from "../../../hooks/useTherapists"
import { cn } from "../../../lib/utils"
import { Skeleton } from "../../ui/Skeleton"
import { Button } from "../../ui/Button"

interface Props {
  selectedId: string;
  onSelect: (therapistId: string) => void;
}

export const TherapistStep = ({ selectedId, onSelect }: Props) => {
  const { therapists, loading, error, refetch } = useTherapists();

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
           <Skeleton className="h-10 w-64 mx-auto rounded-xl mb-4" />
           <Skeleton className="h-5 w-80 mx-auto rounded-lg" />
        </div>
        <div className="grid gap-6">
          {[1, 2].map((i) => (
             <div key={i} className="p-6 rounded-[2rem] border-2 border-primary/5 bg-white flex flex-col sm:flex-row items-center gap-6">
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
      <div className="mx-auto max-w-lg space-y-5 rounded-[2rem] border border-danger/20 bg-danger-surface p-8 py-12 text-center shadow-sm">
        <AlertCircle className="mx-auto h-12 w-12 text-danger opacity-80" />
        <div className="space-y-1">
          <h4 className="font-serif text-xl font-bold text-primary">Unable to Load Therapists</h4>
          <p className="mx-auto max-w-sm text-sm text-danger">{error}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => refetch()}
          className="gap-2 rounded-full border-primary/20 px-6 transition-all hover:bg-primary hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </Button>
      </div>
    );
  }

  if (therapists.length === 0) {
    return (
      <div className="space-y-6 rounded-[2rem] border-2 border-dashed border-primary/10 bg-neutral-surface py-16 text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-primary/20" />
        <p className="font-serif text-xl text-primary/60">No specialists available right now.</p>
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
            type="button"
            onClick={() => onSelect(t.id)}
            aria-pressed={selectedId === t.id}
            className={cn(
              "group flex flex-col items-center gap-6 rounded-[2rem] border-2 p-6 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:flex-row",
              selectedId === t.id
                ? "border-accent bg-white shadow-sm ring-4 ring-accent/10"
                : "border-muted/30 bg-white hover:border-primary/20 hover:bg-background"
            )}
          >
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/10 bg-primary/5 font-serif text-3xl text-primary">
              {t.image ? (
                <img src={t.image} alt={t.name} referrerPolicy="no-referrer" className="h-full w-full object-cover transition-all duration-500 group-hover:scale-105" />
              ) : (
                t.name.charAt(0)
              )}
            </div>
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <h4 className="font-serif text-xl font-bold text-primary transition-colors group-hover:text-accent">{t.name}</h4>
              <p className="text-sm font-medium uppercase tracking-wider text-accent">{t.specialization}</p>
              <p className="line-clamp-2 text-xs leading-relaxed text-primary/60">{t.bio}</p>
            </div>
            <div className={cn(
              "hidden h-10 w-10 items-center justify-center rounded-full transition-colors sm:flex",
              selectedId === t.id ? "bg-accent text-white" : "bg-primary/5 text-primary group-hover:bg-accent/20 group-hover:text-primary"
            )}>
              <ChevronRight className="h-5 w-5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
