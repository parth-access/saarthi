'use client';

/**
 * The frame every therapist page renders inside: a persistent brand rail on
 * desktop, a dismissable drawer on narrow screens, and the page header.
 *
 * The same rail as the admin console's `AdminShell` (green, gold active bar,
 * account footer) with therapist navigation, so both feel like one Saarthi
 * product.
 */
import { ExternalLink, LogOut, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TherapistNavList } from './TherapistNavList';
import { TherapistTopBar } from './TherapistTopBar';
import { resolveTherapistNavItem } from './navigation';
import type { Therapist } from '@/types';

function RailBrand() {
  return (
    <Link
      href="/therapist"
      className="flex items-center gap-2.5 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-base font-bold text-primary"
      >
        S
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[1.0625rem] font-semibold text-white">Saarthi</span>
        <span className="mt-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-accent">
          Therapist workspace
        </span>
      </span>
    </Link>
  );
}

function initialsOf(name: string | undefined): string {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'T'
  );
}

function RailFooter({ therapist }: { therapist: Therapist | null }) {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // Cleared either way: a failed sign-out must not leave a dead button.
      setSigningOut(false);
    }
  };

  // Only a bookable profile has a public page worth opening.
  const publicHref = therapist?.slug && therapist.active && !therapist.archived ? `/therapists/${therapist.slug}` : null;

  return (
    <div className="border-t border-white/10 pt-3">
      {publicHref && (
        <Link
          href={publicHref}
          target="_blank"
          className="mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          View your public profile
        </Link>
      )}
      <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-2.5 py-2">
        {therapist?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={therapist.image}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/20"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white"
          >
            {initialsOf(therapist?.name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{therapist?.name ?? 'Therapist'}</p>
          <p className="truncate text-[0.625rem] text-white/50">{therapist?.specialization || 'Therapist'}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label={signingOut ? 'Signing out' : 'Sign out'}
          title="Sign out"
          className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Rail({
  pathname,
  therapist,
  onNavigate,
}: {
  pathname: string;
  therapist: Therapist | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-1">
        <RailBrand />
      </div>
      <div className="admin-scroll -mx-1 mt-7 flex-1 overflow-y-auto px-1">
        <TherapistNavList pathname={pathname} onNavigate={onNavigate} />
      </div>
      <RailFooter therapist={therapist} />
    </>
  );
}

interface TherapistShellProps {
  children: React.ReactNode;
  therapist?: Therapist | null;
  onRefresh?: () => void;
  loading?: boolean;
}

export function TherapistShell({ children, therapist, onRefresh, loading }: TherapistShellProps) {
  const pathname = usePathname() ?? '/therapist';
  const section = resolveTherapistNavItem(pathname);
  const [navOpen, setNavOpen] = useState(false);

  // Escape closes the drawer
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  // A route change closes the drawer
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className="admin-dense min-h-screen bg-background">
      <a
        href="#therapist-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-[#1F5E3B] to-[#153F28] px-3 pb-3 pt-5 lg:flex">
        <Rail pathname={pathname} therapist={therapist ?? null} />
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            tabIndex={-1}
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/40 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Therapist navigation"
            className="relative flex h-full w-72 max-w-[85%] flex-col bg-gradient-to-b from-[#1F5E3B] to-[#153F28] px-3 pb-3 pt-5 shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-5 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <Rail pathname={pathname} therapist={therapist ?? null} onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <TherapistTopBar
          section={section}
          onOpenNav={() => setNavOpen(true)}
          onRefresh={onRefresh}
          loading={loading}
        />
        <main id="therapist-content" className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {children}
        </main>
      </div>
    </div>
  );
}
