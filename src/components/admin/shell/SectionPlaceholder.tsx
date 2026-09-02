'use client';

/**
 * What a section renders before its server-side query exists.
 *
 * The rule this enforces: an unbuilt section must not be indistinguishable from
 * a built one that happens to have no rows. So instead of an empty table or a
 * zeroed stat card — both of which read as real answers — it states plainly that
 * nothing has been queried, names the collections that will back it, and points
 * at the console that can still do the work today.
 */
import { Construction, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { resolveAdminNavItem, type AdminNavItem } from './navigation';

/**
 * The placeholder for the section the current route belongs to.
 *
 * Pages render this rather than looking their own section up, so a route and its
 * navigation entry cannot drift apart: if `navigation.ts` does not know the
 * route, the page says so instead of inventing a heading for it.
 */
export function PlannedSection() {
  const section = resolveAdminNavItem(usePathname() ?? '');
  if (!section) {
    return (
      <p className="text-sm text-muted-foreground">
        This route has no entry in the admin navigation.
      </p>
    );
  }
  return <SectionPlaceholder section={section} />;
}

export function SectionPlaceholder({ section }: { section: AdminNavItem }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-hairline bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning-surface">
          <Construction aria-hidden="true" className="h-4 w-4 text-warning" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-primary">{section.label} is not wired up yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">{section.purpose}</p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-primary/80">
        No data has been loaded on this page. Nothing here is a real count, and an empty
        area does not mean there is nothing to act on — this section simply has no query
        behind it yet.
      </p>

      <div className="mt-5 rounded-xl bg-neutral-surface/70 p-4">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/50">
          Will read from
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {section.backedBy.map((source) => (
            <li
              key={source}
              className="rounded-md bg-white px-2 py-1 font-mono text-[0.6875rem] text-primary/70 ring-1 ring-hairline"
            >
              {source}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/legacy">
            Use the current admin console
            <ExternalLink aria-hidden="true" className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
