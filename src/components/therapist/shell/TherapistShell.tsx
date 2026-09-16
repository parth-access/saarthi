'use client';

/**
 * The frame every therapist page renders inside: a persistent section rail on
 * desktop, a dismissable drawer on narrow screens, and the page header.
 *
 * Structurally identical to the admin console's `AdminShell` — same fixed rail,
 * same mobile drawer, same classes — but with therapist-specific navigation and
 * branding. A therapist's layout should feel like the same Saarthi product.
 */
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TherapistNavList } from './TherapistNavList';
import { TherapistTopBar } from './TherapistTopBar';
import { resolveTherapistNavItem } from './navigation';
import type { Therapist } from '@/types';

function RailBrand() {
  return (
    <Link
      href="/therapist"
      className="flex items-baseline gap-2 rounded-lg px-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="font-serif text-base font-semibold text-primary">Saarthi</span>
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent">Therapist</span>
    </Link>
  );
}

function ProfileRail({ therapist }: { therapist: Therapist | null }) {
  const initials = therapist?.name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'T';

  return (
    <div className="mt-auto border-t border-hairline px-2.5 pt-4">
      <div className="flex items-center gap-2.5">
        {therapist?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={therapist.image}
            alt=""
            className="h-8 w-8 rounded-lg border border-hairline object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-primary">{therapist?.name ?? 'Therapist'}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">{therapist?.specialization ?? 'Clinical workspace'}</p>
        </div>
      </div>
    </div>
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-neutral-surface/60 px-3 py-4 lg:flex">
        <RailBrand />
        <TherapistNavList pathname={pathname} />
        <ProfileRail therapist={therapist ?? null} />
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-primary/20 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Therapist navigation"
            className="relative flex h-full w-64 max-w-[80%] flex-col border-r border-hairline bg-background px-3 py-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <RailBrand />
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-primary/60 hover:bg-white/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <TherapistNavList pathname={pathname} onNavigate={() => setNavOpen(false)} />
            <ProfileRail therapist={therapist ?? null} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <TherapistTopBar
          section={section}
          onOpenNav={() => setNavOpen(true)}
          onRefresh={onRefresh}
          loading={loading}
        />
        <main id="therapist-content" className="px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
