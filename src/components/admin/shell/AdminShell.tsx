'use client';

/**
 * The frame every admin page renders inside: a persistent brand rail on
 * desktop, a dismissable drawer on narrow screens, a top bar with search, and
 * the page header.
 *
 * Layout choice: the rail is fixed and the content column scrolls on its own,
 * so a long booking table never pushes navigation off screen — the operator can
 * always jump sections from wherever they are in a list.
 *
 * The command palette is loaded on first use, not with the shell: it is the
 * fastest way around the console but nobody needs its code before they press
 * ⌘K, and the shell is on the critical path of every admin page.
 */
import { ExternalLink, LogOut, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { setAdminCacheOwner } from '../adminReadCache';
import { AdminNavList } from './AdminNavList';
import { AdminTopBar } from './AdminTopBar';
import { resolveAdminNavItem } from './navigation';

const AdminCommandPalette = dynamic(
  () => import('./AdminCommandPalette').then((module) => module.AdminCommandPalette),
  { ssr: false }
);

function RailBrand() {
  return (
    <Link
      href="/admin"
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
          Admin console
        </span>
      </span>
    </Link>
  );
}

/** Initials for the signed-in operator's avatar, from the email's local part. */
export function initialsFor(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase() || 'A';
}

function RailFooter() {
  const { currentUser, logout } = useAuth();
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

  return (
    <div className="border-t border-white/10 pt-3">
      <Link
        href="/"
        className="mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium text-white/60 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        View the public site
      </Link>
      <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-2.5 py-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white"
        >
          {initialsFor(currentUser?.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">{currentUser?.email ?? 'Signed in'}</p>
          <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-white/50">
            {currentUser?.role ?? 'admin'}
          </p>
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

function Rail({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="px-1">
        <RailBrand />
      </div>
      <div className="admin-scroll -mx-1 mt-7 flex-1 overflow-y-auto px-1">
        <AdminNavList pathname={pathname} onNavigate={onNavigate} />
      </div>
      <RailFooter />
    </>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  // During render, not in an effect: the pages below read the cache in their
  // first render, before any effect of this component would have run.
  setAdminCacheOwner(currentUser?.uid ?? null);
  const pathname = usePathname() ?? '/admin';
  const section = resolveAdminNavItem(pathname);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isSectionRoot = section?.href === pathname;

  // Escape closes the drawer: the same key that dismisses every other overlay
  // in the app should not be the one that does nothing here.
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  // ⌘K / Ctrl+K opens the palette from anywhere in the console.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A route change means the drawer's job is done.
  useEffect(() => setNavOpen(false), [pathname]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="admin-dense min-h-screen bg-background">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-[#1F5E3B] to-[#153F28] px-3 pb-3 pt-5 lg:flex">
        <Rail pathname={pathname} />
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
            aria-label="Admin navigation"
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
            <Rail pathname={pathname} onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <AdminTopBar section={section} isSectionRoot={isSectionRoot} onOpenNav={() => setNavOpen(true)} onOpenSearch={openPalette} />
        <main id="admin-content" className="mx-auto w-full max-w-[1400px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {section && isSectionRoot ? (
            <header className="mb-5 lg:mb-6">
              <h1 className="font-serif text-primary">{section.label}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{section.purpose}</p>
            </header>
          ) : (
            <h1 className="sr-only">{section ? `${section.label} — detail` : 'Admin'}</h1>
          )}
          {children}
        </main>
      </div>

      {paletteOpen && <AdminCommandPalette onClose={closePalette} />}
    </div>
  );
}
