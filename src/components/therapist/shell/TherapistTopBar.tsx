'use client';

/**
 * The therapist workspace's top bar: which section you are in, what it is for,
 * and a way to re-read your sessions. Signing out lives in the rail's account
 * footer (and the mobile drawer), as it does in the admin console.
 *
 * The workspace reads its data once and does not poll, so Refresh is how a
 * therapist sees a request that arrived after they opened the page.
 */
import { Menu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { TherapistNavItem } from './navigation';

interface TherapistTopBarProps {
  readonly section: TherapistNavItem | null;
  readonly onOpenNav: () => void;
  readonly onRefresh?: () => void;
  readonly loading?: boolean;
}

export function TherapistTopBar({ section, onOpenNav, onRefresh, loading }: TherapistTopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex min-h-14 w-full max-w-[1400px] items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1.5 rounded-lg p-2 text-primary/70 hover:bg-neutral-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-[1.25rem] leading-tight text-primary">{section?.label ?? 'Dashboard'}</h1>
          {section?.purpose && (
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{section.purpose}</p>
          )}
        </div>

        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="shrink-0">
            <RefreshCw className={cn('h-3.5 w-3.5 sm:mr-1.5', loading && 'animate-spin')} aria-hidden="true" />
            <span className="hidden sm:inline">{loading ? 'Refreshing…' : 'Refresh'}</span>
            <span className="sr-only sm:hidden">Refresh</span>
          </Button>
        )}
      </div>
    </header>
  );
}
