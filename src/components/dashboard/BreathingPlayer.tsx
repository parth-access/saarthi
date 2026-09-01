"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw } from "lucide-react";

/**
 * A guided breathing timer for the dashboard wellness page. It genuinely runs:
 * one-second ticks walk through the pattern's phases, the circle animates for
 * exactly the length of the current phase, and completed rounds are counted.
 * Nothing is persisted or sent anywhere — it lives in the open tab only.
 */

/** One phase of a breathing pattern, e.g. `{ label: "Breathe in", seconds: 4 }`. */
export interface BreathingPhase {
  label: string;
  seconds: number;
}

export interface BreathingPattern {
  id: string;
  title: string;
  desc: string;
  /** Tailwind background class used for the pattern's card. */
  color: string;
  phases: BreathingPhase[];
}

/** Timer position: which phase, seconds left in it, and rounds finished. */
export interface BreathTick {
  phaseIndex: number;
  remaining: number;
  cycles: number;
}

export const initialBreathTick = (phases: BreathingPhase[]): BreathTick => ({
  phaseIndex: 0,
  remaining: phases[0]?.seconds ?? 0,
  cycles: 0,
});

/**
 * Pure one-second advance. Counts the current phase down and, when it runs out,
 * moves to the next phase — wrapping to the start and banking a completed round.
 */
export function advanceBreath(phases: BreathingPhase[], state: BreathTick): BreathTick {
  if (phases.length === 0) return state;
  if (state.remaining > 1) return { ...state, remaining: state.remaining - 1 };
  const nextIndex = (state.phaseIndex + 1) % phases.length;
  return {
    phaseIndex: nextIndex,
    remaining: phases[nextIndex].seconds,
    cycles: nextIndex === 0 ? state.cycles + 1 : state.cycles,
  };
}

export function BreathingPlayer({ pattern }: { pattern: BreathingPattern }) {
  const { phases } = pattern;
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState<BreathTick>(() => initialBreathTick(phases));
  const timer = useRef<number | null>(null);

  const phase = phases[tick.phaseIndex];
  const started = running || tick.cycles > 0 || tick.phaseIndex > 0 || tick.remaining !== phases[0].seconds;

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clear();
    setRunning(false);
    setTick(initialBreathTick(phases));
  }, [clear, phases]);

  useEffect(() => {
    if (!running) {
      clear();
      return;
    }
    timer.current = window.setInterval(() => setTick((state) => advanceBreath(phases, state)), 1000);
    return clear;
  }, [running, clear, phases]);

  // Pause when the tab goes to the background so a forgotten timer can't drift.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setRunning(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const isInhale = phase.label === "Breathe in";
  const isExhale = phase.label === "Breathe out";

  return (
    <div className="mt-6 pt-6 border-t border-primary/10">
      <div className="flex flex-col items-center">
        <div className="relative w-40 h-40 flex items-center justify-center mb-5">
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-[#E6A520]/15 border border-[#E6A520]/30"
            animate={{ scale: running ? (isInhale ? 1 : isExhale ? 0.62 : undefined) : 0.82 }}
            transition={{ duration: running ? phase.seconds : 0.4, ease: "easeInOut" }}
          />
          <div className="relative text-center">
            <p className="text-3xl font-serif text-primary tabular-nums">{tick.remaining}</p>
            <p className="text-[10px] uppercase tracking-widest text-primary/50 mt-1 font-sans">
              second{tick.remaining === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <p aria-live="polite" className="text-lg font-serif text-primary min-h-[28px]">
          {running ? phase.label : "Ready when you are"}
        </p>
        <p className="text-xs text-primary/50 mt-1 font-sans">
          {tick.cycles > 0
            ? `${tick.cycles} round${tick.cycles === 1 ? "" : "s"} complete`
            : "Follow the circle as it grows and shrinks"}
        </p>

        <div className="flex items-center gap-2 mt-5 font-sans">
          <button
            type="button"
            onClick={() => setRunning((r) => !r)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
          >
            {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {running ? "Pause" : started ? "Resume" : "Start"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-primary/15 bg-white text-primary text-sm font-medium hover:bg-black/5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
