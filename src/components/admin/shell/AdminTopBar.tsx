'use client';

/**
 * The console's top bar: where you are, and the way to get anywhere else.
 *
 * The search field is a button that opens the command palette rather than an
 * input of its own, so it can never look like it searched when it did not: the
 * palette says exactly what each result will do (open a section, or run a
 * bookings lookup) before the operator commits to it.
 */
import { ChevronRight, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import type { AdminNavItem } from './navigation';

interface AdminTopBarProps {
  readonly section: AdminNavItem | null;
  /** False on a detail route, where the breadcrumb gains a "Detail" crumb. */
  readonly isSectionRoot: boolean;
  readonly onOpenNav: () => void;
  readonly onOpenSearch: () => void;
}

interface Crumb {
  readonly label: string;
  /** Absent on the current page. */
  readonly href?: string;
}

export function adminBreadcrumbs(section: AdminNavItem | null, isSectionRoot: boolean): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Admin', href: '/admin' }];
  if (!section) return crumbs;
  const label = section.href === '/admin' ? 'Overview' : section.label;
  crumbs.push(isSectionRoot ? { label } : { label, href: section.href });
  if (!isSectionRoot) crumbs.push({ label: 'Detail' });
  return crumbs;
}

export function AdminTopBar({ section, isSectionRoot, onOpenNav, onOpenSearch }: AdminTopBarProps) {
  const crumbs = adminBreadcrumbs(section, isSectionRoot);
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1.5 rounded-lg p-2 text-primary/70 hover:bg-neutral-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            {crumbs.map((crumb, index) => (
              <li
                key={crumb.label}
                // On a phone only the last two crumbs fit; "Admin" is implied.
                className={`flex min-w-0 items-center gap-1.5 ${index === 0 && crumbs.length > 1 ? 'hidden sm:flex' : ''}`}
              >
                {index > 0 && (
                  <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-primary/30 ${index === 1 ? 'hidden sm:block' : ''}`} />
                )}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="truncate rounded text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate font-medium text-primary">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search the console"
          aria-keyshortcuts="Meta+K Control+K"
          className="group flex h-9 items-center gap-2 rounded-lg border border-hairline bg-neutral-surface/70 px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/25 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-72 sm:px-3"
        >
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-primary/50" />
          <span className="hidden flex-1 truncate text-left sm:block">Search bookings, jump to…</span>
          <kbd className="hidden rounded border border-hairline bg-white px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold text-muted-foreground sm:block">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
