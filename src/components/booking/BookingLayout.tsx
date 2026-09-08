"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  /** Persistent summary rendered as a sticky right rail on lg+. Omit for the full-width Review step. */
  aside?: React.ReactNode;
  className?: string;
}

/**
 * Presentational shell for the wizard body: a single readable column, or — when
 * `aside` is supplied — a two-column grid with a sticky Booking Summary rail on
 * large screens.
 *
 * The left column is always rendered so a step's exit animation keeps playing
 * when the aside is removed (Details → Review): in that same commit the grid
 * collapses to one column and the summary card morphs to the centre via its
 * `layoutId`, with `layout` animating the column resize. Collapses to plain
 * divs when the user prefers reduced motion.
 */
export function BookingLayout({ children, aside, className }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      layout={!reduce}
      className={cn(
        "lg:grid lg:items-start lg:gap-8",
        aside ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "lg:grid-cols-1",
        className,
      )}
    >
      <motion.div layout={!reduce} className="min-w-0">{children}</motion.div>
      {aside && <div className="hidden lg:sticky lg:top-8 lg:block">{aside}</div>}
    </motion.div>
  );
}
