"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Clock, ChevronDown, ShieldCheck, Sparkles, HelpCircle, UserRound, FileText, CheckCircle2, Mail } from "lucide-react";
import { Therapist } from "../../types";
import { SESSION_DURATION_MINUTES } from "@/shared/constants";
import { cn } from "../../lib/utils";
import { formatTime12h, SESSION_PRICE_DISPLAY } from "./bookingUi";

interface ClientDetails {
  name: string;
  email: string;
  phone: string;
  message?: string;
  consent?: boolean;
}

interface Props {
  therapist?: Therapist;
  sessionType: string;
  date: string;
  time: string;
  /** 'sidebar' = always-open desktop card; 'mobile' = collapsible bar; 'review' = centred card on the Review step. */
  variant?: "sidebar" | "mobile" | "review";
  className?: string;
  /** Client-supplied details shown only on the review card. */
  client?: ClientDetails;
}

function safeDate(date: string): string {
  if (!date) return "";
  try {
    return format(parseISO(date), "EEE, dd MMM yyyy");
  } catch {
    return date;
  }
}

/**
 * One labelled row; renders a muted placeholder until its value is chosen.
 * The value re-mounts on change so a new selection settles in with a short fade
 * rather than snapping (a no-op when reduced motion is preferred).
 */
function Row({ label, value, icon: Icon }: { label: string; value?: string; icon: React.ComponentType<{ className?: string }> }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary/70">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {value ? (
          <motion.p
            key={value}
            initial={reduce ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="mt-0.5 truncate text-sm font-semibold text-primary"
          >
            {value}
          </motion.p>
        ) : (
          <p className="mt-0.5 text-sm text-primary/35">Not selected yet</p>
        )}
      </div>
    </div>
  );
}

function SummaryBody({
  therapist,
  sessionType,
  date,
  time,
  children,
}: Omit<Props, "variant" | "className"> & { children?: React.ReactNode }) {
  const initials = therapist?.name ? therapist.name.split(" ").map((n) => n[0]).join("").slice(0, 2) : null;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 border-b border-primary/10 pb-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/10 bg-primary/5 text-base font-semibold text-primary">
          {therapist?.image ? (
            <img src={therapist.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>{initials ?? "?"}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent">Your specialist</p>
          {therapist ? (
            <>
              <p className="truncate text-base font-semibold text-primary">{therapist.name}</p>
              <p className="truncate text-xs font-medium text-primary/60">{therapist.specialization}</p>
            </>
          ) : (
            <p className="text-sm text-primary/35">Choose a therapist to begin</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Row label="Session" value={sessionType ? `${sessionType} Therapy` : undefined} icon={Sparkles} />
        <Row label="Date" value={safeDate(date)} icon={CalendarDays} />
        <Row label="Time (IST)" value={time ? formatTime12h(time) : undefined} icon={Clock} />
      </div>

      {children}

      <div className="flex items-center justify-between rounded-2xl border border-primary/10 bg-white/70 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Total</p>
          <p className="text-lg font-semibold tabular-nums text-primary">{SESSION_PRICE_DISPLAY}</p>
        </div>
        <p className="text-right text-xs font-medium leading-snug text-muted-foreground">
          {SESSION_DURATION_MINUTES}-minute
          <br />
          online session
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3 text-xs leading-relaxed text-primary/70">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
        <span>After secure payment we email your calendar invite, video link and receipt right away.</span>
      </div>
    </div>
  );
}

/** Review-only block: who the session is for, plus the consent echo. */
function ReviewClientSection({ client }: { client?: ClientDetails }) {
  if (!client) return null;
  return (
    <div className="space-y-4">
      <Row label="Client name" value={client.name} icon={UserRound} />
      <Row label="Contact" value={[client.email, client.phone].filter(Boolean).join(" · ")} icon={Mail} />
      {client.message ? <Row label="Note for your therapist" value={client.message} icon={FileText} /> : null}
      {client.consent !== false && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <span>You have agreed to Saarthi&apos;s Privacy Policy &amp; confidential therapy terms.</span>
        </div>
      )}
    </div>
  );
}

/**
 * The card surface is shared by the sidebar and review variants so the card
 * keeps its visual identity while the shared-element transition moves it from
 * the right rail to the centre of the page.
 */
export const CARD_SURFACE = "rounded-[2rem] border border-primary/10 bg-white/85 p-6 shadow-soft backdrop-blur-sm";

export function BookingSummary({ therapist, sessionType, date, time, variant = "sidebar", className, client }: Props) {
  const reduce = useReducedMotion();
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
              <span className="block text-xs font-medium text-muted-foreground">Booking summary</span>
              <span className="block truncate text-xs font-semibold text-primary">
                {condensed || "Fill in your session details"}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-primary">{SESSION_PRICE_DISPLAY}</span>
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

  if (variant === "review") {
    return (
      <div className={cn(CARD_SURFACE, className)}>
        <h3 className="mb-5 font-sans text-base font-semibold text-primary">Booking summary</h3>
        <SummaryBody therapist={therapist} sessionType={sessionType} date={date} time={time}>
          {/* Present at full height from the first frame so the morphing card
              lands at its final size; the contents fade in once it settles. */}
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0.15 } : { delay: 0.3, duration: 0.35, ease: "easeOut" }}
            className="space-y-4 border-t border-primary/10 pt-5"
          >
            <ReviewClientSection client={client} />
          </motion.div>
        </SummaryBody>
      </div>
    );
  }

  return (
    <aside className={cn(CARD_SURFACE, className)}>
      <h3 className="mb-5 font-sans text-base font-semibold text-primary">Booking summary</h3>
      <SummaryBody therapist={therapist} sessionType={sessionType} date={date} time={time} />
    </aside>
  );
}
