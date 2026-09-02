'use client';

/**
 * Page header for the admin console: which section you are in, what it is for,
 * and who you are signed in as.
 *
 * There is deliberately no search box here yet. Global search is a later
 * increment, and a text field that looks like search but does nothing is worse
 * than no field at all — it wastes the one action an operator reaches for first.
 */
import { LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminNavItem } from './navigation';

interface AdminTopBarProps {
  readonly section: AdminNavItem | null;
  readonly onOpenNav: () => void;
}

export function AdminTopBar({ section, onOpenNav }: AdminTopBarProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      router.replace('/login');
    } finally {
      // Cleared either way: a failed sign-out must not leave a dead button.
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
          <h1 className="truncate font-serif text-primary">{section?.label ?? 'Admin'}</h1>
          {section?.purpose && (
            <p className="truncate text-xs text-muted-foreground">{section.purpose}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
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
