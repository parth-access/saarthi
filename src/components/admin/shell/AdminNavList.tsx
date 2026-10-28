'use client';

/**
 * The console's navigation list, shared by the desktop rail and the mobile
 * drawer so both are driven by one declaration in `navigation.ts`.
 *
 * Items are real links, not click handlers, so they keep browser affordances:
 * tab order, focus ring, middle-click, and copyable URLs an operator can paste
 * into a ticket. `aria-current="page"` carries the active state to assistive
 * tech instead of relying on colour alone; the gold bar is the sighted cue.
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
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          active ? 'bg-white/[0.12] text-white' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
        )}
      >
        {active && (
          <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" />
        )}
        <Icon
          aria-hidden="true"
          className={cn('h-4 w-4 shrink-0', active ? 'text-accent' : 'text-white/50 group-hover:text-white/80')}
        />
        <span className="truncate">{item.label}</span>
        {item.status === 'planned' && (
          // An operator should know a section is not wired up before clicking
          // it, not after reading an empty table.
          <span
            className="ml-auto shrink-0 rounded-full bg-accent/20 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-accent"
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
    <nav aria-label="Admin sections" className="flex flex-col gap-6">
      {ADMIN_NAV.map((group) => (
        <div key={group.id}>
          <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-white/40">
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
