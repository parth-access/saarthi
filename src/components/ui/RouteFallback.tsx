"use client";

/**
 * Shared UI for route-segment `error.tsx` and `loading.tsx` files.
 *
 * Built from existing Saarthi primitives so dashboard, therapist and admin
 * segments load and fail consistently.
 *
 * Segment layouts remain mounted around these boundaries, so the user keeps
 * their navigation when a child route fails.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;

  /** Segment landing page, e.g. "/dashboard". */
  homeHref: string;

  /** Label for the link to the segment landing page. */
  homeLabel: string;

  /** Optional wrapper spacing. */
  className?: string;

  /** Show a link to the public contact page. */
  showContact?: boolean;
}

export function RouteError({
  error,
  reset,
  homeHref,
  homeLabel,
  className,
  showContact = false,
}: RouteErrorProps) {
  const pathname = usePathname();

  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  /*
   * If the segment landing page itself crashed, don't link back to the same
   * broken page. Exit to the public homepage instead.
   */
  const atSegmentHome = pathname === homeHref;
  const exitHref = atSegmentHome ? "/" : homeHref;
  const exitLabel = atSegmentHome ? "Back to home" : homeLabel;

  return (
    <div className={cn("mx-auto w-full max-w-xl", className)}>
      <EmptyState
        role="alert"
        icon={AlertTriangle}
        title="We couldn’t load this page"
        description="Something went wrong on our side, and your information is safe. Please try again, or go back and continue from there."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => reset()}
                className={buttonVariants({ variant: "primary" })}
              >
                Try again
              </button>

              <Link
                href={exitHref}
                className={buttonVariants({ variant: "outline" })}
              >
                {exitLabel}
              </Link>
            </div>

            {showContact && (
              <p className="text-sm text-primary/60">
                Still stuck?{" "}
                <Link
                  href="/contact"
                  className="rounded underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Contact us
                </Link>
              </p>
            )}

            {error.digest && (
              <p className="text-xs text-primary/50">
                Reference: {error.digest}
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}

interface RouteLoadingProps {
  /** Optional wrapper spacing. */
  className?: string;
}

export function RouteLoading({ className }: RouteLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("mx-auto w-full max-w-5xl space-y-6", className)}
    >
      <span className="sr-only">Loading…</span>

      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>

      <Skeleton
        className="h-64 rounded-2xl"
        aria-hidden="true"
      />
    </div>
  );
}