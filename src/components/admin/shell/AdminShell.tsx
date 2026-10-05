'use client';

/**
 * The frame every admin page renders inside: a persistent section rail on
 * desktop, a dismissable drawer on narrow screens, and the page header.
 *
 * Layout choice: the rail is fixed and the content column scrolls on its own,
 * so a long booking table never pushes navigation off screen — the operator can
 * always jump sections from wherever they are in a list.
 */
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminNavList } from './AdminNavList';
import { AdminTopBar } from './AdminTopBar';
import { resolveAdminNavItem } from './navigation';

function RailBrand() {
  return (
    <Link
      href="/admin"
      className="flex items-baseline gap-2 rounded-lg px-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="font-serif text-base font-semibold text-primary">Saarthi</span>
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent">Admin</span>
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const section = resolveAdminNavItem(pathname);
  const [navOpen, setNavOpen] = useState(false);

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

  // A route change means the drawer's job is done.
  useEffect(() => setNavOpen(false), [pathname]);

  return (
    <div className="admin-dense min-h-screen bg-background">
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-primary focus:shadow-md"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-neutral-surface/60 px-3 py-4 lg:flex">
        <RailBrand />
        <div className="mt-6 flex-1 overflow-y-auto">
          <AdminNavList pathname={pathname} />
        </div>
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
            aria-label="Admin navigation"
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
            <div className="mt-6 flex-1 overflow-y-auto">
              <AdminNavList pathname={pathname} onNavigate={() => setNavOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <AdminTopBar section={section} onOpenNav={() => setNavOpen(true)} />
        <main id="admin-content" className="px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
