import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BackLinkProps {
  /**
   * The deterministic parent route. Deliberately a plain href rather than
   * `router.back()`: browser history is not navigation. A user who arrived from
   * a bookmark, an email, or a redirect has no meaningful "previous page", so
   * every contextual back action must point at a real place in the app.
   */
  readonly href: string;
  /** Visible text, e.g. "Back to Sessions". */
  readonly label: string;
  /** Leading icon. Defaults to the left arrow used by every Saarthi back link. */
  readonly icon?: LucideIcon;
  readonly className?: string;
}

/**
 * Contextual "back" navigation: a semantic link to a known parent route.
 *
 * Not a substitute for the global header/footer — it is for pages that sit
 * below a parent (a booking inside all bookings, an auth page inside the
 * public site) where a single obvious way out is worth the line it takes.
 */
export function BackLink({ href, label, icon: Icon = ArrowLeft, className }: BackLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm text-xs text-primary/70 underline-offset-2',
        'transition-colors hover:text-primary hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      {label}
    </Link>
  );
}
