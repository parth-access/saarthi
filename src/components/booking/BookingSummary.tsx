"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, Clock, ChevronDown, ShieldCheck, Sparkles, HelpCircle } from "lucide-react";
import { Therapist } from "../../types";
import { SESSION_DURATION_MINUTES } from "@/shared/constants";
import { cn } from "../../lib/utils";
import { formatTime12h, SESSION_PRICE_DISPLAY } from "./bookingUi";

interface Props {
  therapist?: Therapist;
  sessionType: string;
  date: string;
  time: string;
  /** 'sidebar' = always-open desktop card; 'mobile' = collapsible bar. */
  variant?: "sidebar" | "mobile";
  className?: string;
}

function safeDate(date: string): string {
  if (!date) return "";
  try {
    return format(parseISO(date), "EEE, dd MMM yyyy");
  } catch {
    return date;
  }
}

/** One labelled row; renders a muted placeholder until its value is chosen. */
function Row({ label, value, icon: Icon }: { label: string; value?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary/70">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        {value ? (
          <p className="truncate font-serif text-sm font-bold text-primary">{value}</p>
        ) : (
          <p className="text-sm italic text-primary/30">Not selected yet</p>
        )}
      </div>
    </div>
  );
}

function SummaryBody({ therapist, sessionType, date, time }: Omit<Props, "variant" | "className">) {
  const initials = therapist?.name ? therapist.name.split(" ").map((n) => n[0]).join("").slice(0, 2) : null;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-primary/10 pb-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/10 bg-primary/5 font-serif text-lg font-bold text-primary">
          {therapist?.image ? (
            <img src={therapist.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{initials ?? "?"}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-accent">Your specialist</p>
          {therapist ? (
            <>
              <p className="truncate font-serif text-base font-bold text-primary">{therapist.name}</p>
              <p className="truncate text-xs font-medium text-primary/60">{therapist.specialization}</p>
            </>
          ) : (
            <p className="text-sm italic text-primary/30">Choose a therapist to begin</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Row label="Session" value={sessionType ? `${sessionType} Therapy` : undefined} icon={Sparkles} />
        <Row label="Date" value={safeDate(date)} icon={CalendarDays} />
        <Row label="Time (IST)" value={time ? formatTime12h(time) : undefined} icon={Clock} />
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-primary/10 bg-white/70 px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p>
          <p className="font-serif text-lg font-bold text-primary">{SESSION_PRICE_DISPLAY}</p>
        </div>
        <p className="text-right text-[11px] font-medium leading-tight text-muted-foreground">
          {SESSION_DURATION_MINUTES}-minute
          <br />
          online session
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3 text-[11px] leading-relaxed text-primary/70">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span>After secure payment we email your calendar invite, video link and receipt right away.</span>
      </div>
    </div>
  );
}

export function BookingSummary({ therapist, sessionType, date, time, variant = "sidebar", className }: Props) {
  const [open, setOpen] = React.useState(false);

  if (variant === "mobile") {
    const condensed = [therapist?.name, safeDate(date), time && formatTime12h(time)].filter(Boolean).join(" · ");
    return (
      <div className={cn("rounded-2xl border border-primary/10 bg-white/80 shadow-sm backdrop-blur", className)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Booking summary</span>
              <span className="block truncate text-xs font-semibold text-primary">
                {condensed || "Fill in your session details"}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-serif text-sm font-bold text-primary">{SESSION_PRICE_DISPLAY}</span>
            <ChevronDown className={cn("h-4 w-4 text-primary/50 transition-transform", open && "rotate-180")} />
          </span>
        </button>
        {open && (
          <div className="border-t border-primary/10 px-4 py-4">
            <SummaryBody therapist={therapist} sessionType={sessionType} date={date} time={time} />
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className={cn("rounded-[2rem] border border-primary/10 bg-background/70 p-6 shadow-soft", className)}>
      <h3 className="mb-5 font-serif text-lg font-bold text-primary">Booking summary</h3>
      <SummaryBody therapist={therapist} sessionType={sessionType} date={date} time={time} />
    </aside>
  );
}
