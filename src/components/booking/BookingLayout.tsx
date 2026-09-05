import * as React from "react";
import { cn } from "../../lib/utils";

interface Props {
  children: React.ReactNode;
  /** Persistent summary rendered as a sticky right rail on lg+. Omit for full-width steps. */
  aside?: React.ReactNode;
  className?: string;
}

/**
 * Presentational shell for the wizard body: a single readable column, or — when
 * `aside` is supplied — a two-column grid with a sticky Booking Summary rail on
 * large screens. The step content stays in the left column on every breakpoint,
 * so the mobile experience is a genuine single column rather than a squeezed grid.
 */
export function BookingLayout({ children, aside, className }: Props) {
  if (!aside) {
    return <div className={cn("mx-auto max-w-3xl", className)}>{children}</div>;
  }

  return (
    <div className={cn("lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8", className)}>
      <div className="min-w-0">{children}</div>
      <div className="hidden lg:sticky lg:top-8 lg:block">{aside}</div>
    </div>
  );
}
