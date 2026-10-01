'use client';

/**
 * Page header for the therapist workspace. Structurally identical to the admin
 * console's `AdminTopBar`: section label, purpose subtitle, user info, sign-out.
 */
import { LogOut, Menu, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { TherapistNavItem } from './navigation';

interface TherapistTopBarProps {
  readonly section: TherapistNavItem | null;
  readonly onOpenNav: () => void;
  readonly onRefresh?: () => void;
  readonly loading?: boolean;
}

export function TherapistTopBar({ section, onOpenNav, onRefresh, loading }: TherapistTopBarProps) {
  const { currentUser, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1 rounded-lg p-2 text-primary/70 hover:bg-white/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-primary">{section?.label ?? 'Dashboard'}</h1>
          {section?.purpose && (
            <p className="truncate text-xs text-muted-foreground">{section.purpose}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="shrink-0">
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
              <span className="hidden sm:inline">{loading ? 'Reading…' : 'Refresh'}</span>
            </Button>
          )}

          {currentUser?.email && (
            <div className="hidden text-right sm:block">
              <p className="max-w-[13rem] truncate text-xs font-medium text-primary">{currentUser.email}</p>
              <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
                {currentUser.role}
              </p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label="Sign out"
          >
            <LogOut aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </header>
  );
}
