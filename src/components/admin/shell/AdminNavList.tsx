'use client';

/**
 * The console's navigation list, shared by the desktop rail and the mobile
 * drawer so both are driven by one declaration in `navigation.ts`.
 *
 * Items are real links, not click handlers, so they keep browser affordances:
 * tab order, focus ring, middle-click, and copyable URLs an operator can paste
 * into a ticket. `aria-current="page"` carries the active state to assistive
 * tech instead of relying on colour alone.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, resolveAdminNavItem, type AdminNavItem } from './navigation';

interface AdminNavListProps {
  /** Current pathname, from the caller so both shells share one source. */
  readonly pathname: string;
  /** Fired after a navigation, so the mobile drawer can close itself. */
  readonly onNavigate?: () => void;
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={cn(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          active
            ? 'bg-white text-primary shadow-sm ring-1 ring-primary/10'
            : 'text-primary/70 hover:bg-white/60 hover:text-primary'
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-primary/45 group-hover:text-primary/70')}
        />
        <span className="truncate">{item.label}</span>
        {item.status === 'planned' && (
          // An operator should know a section is not wired up before clicking
          // it, not after reading an empty table.
          <span
            className="ml-auto shrink-0 rounded-full bg-warning-surface px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-warning"
            title="Not wired to live data yet"
          >
            Soon
          </span>
        )}
      </Link>
    </li>
  );
}

export function AdminNavList({ pathname, onNavigate }: AdminNavListProps) {
  const activeItem = resolveAdminNavItem(pathname);

  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-5">
      {ADMIN_NAV.map((group) => (
        <div key={group.id}>
          <p className="px-2.5 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/40">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                active={activeItem?.href === item.href}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
