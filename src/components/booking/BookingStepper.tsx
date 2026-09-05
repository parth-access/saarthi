"use client";

import * as React from "react";
import { Check, UserRound, Sparkles, CalendarDays, Clock, ClipboardList, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/utils";
import { STEP_LABELS } from "./bookingUi";

/** One icon per selection step, aligned to STEP_LABELS order. */
const STEP_ICONS = [UserRound, Sparkles, CalendarDays, Clock, ClipboardList, ShieldCheck] as const;

interface Props {
  /** 1-based current step (1..6). Step 7 is the success screen and hides the stepper. */
  currentStep: number;
}

/**
 * Labelled, icon'd progress indicator that replaces the bare numbered dots.
 * Presentational only — it reflects `currentStep`, it does not drive navigation.
 */
export function BookingStepper({ currentStep }: Props) {
  const total = STEP_LABELS.length;
  const clamped = Math.min(Math.max(currentStep, 1), total);
  const progress = ((clamped - 1) / (total - 1)) * 100;

  return (
    <nav aria-label="Booking progress">
      {/* Compact bar on small screens — six labelled nodes don't fit legibly. */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate font-serif text-lg font-bold text-primary">{STEP_LABELS[clamped - 1]}</p>
          <p className="shrink-0 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            Step {clamped} <span className="text-primary/30">/ {total}</span>
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Full labelled stepper from sm up. */}
      <ol className="hidden items-start sm:flex">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const Icon = STEP_ICONS[i];
          const isDone = clamped > stepNum;
          const isCurrent = clamped === stepNum;
          return (
            <React.Fragment key={label}>
              <li className="flex w-16 shrink-0 flex-col items-center gap-2 md:w-20">
                <div
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-500",
                    isCurrent && "scale-105 border-primary bg-primary text-white shadow-lg shadow-primary/20",
                    isDone && "border-primary/20 bg-primary/10 text-primary",
                    !isCurrent && !isDone && "border-muted bg-white text-muted-foreground/70",
                  )}
                >
                  {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <span
                  className={cn(
                    "text-center text-[11px] font-bold uppercase tracking-wider transition-colors",
                    isCurrent ? "text-primary" : isDone ? "text-primary/60" : "text-muted-foreground/60",
                  )}
                >
                  {label}
                </span>
              </li>
              {i < total - 1 && (
                <div className="mt-[21px] h-[2px] flex-1 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/40 transition-all duration-700 ease-out"
                    style={{ width: isDone ? "100%" : "0%" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
