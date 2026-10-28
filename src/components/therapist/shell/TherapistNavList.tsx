'use client';

/**
 * The therapist workspace's navigation list, shared by the desktop rail and
 * the mobile drawer. Same pattern and look as the admin console's
 * `AdminNavList`: white on the green rail, with `aria-current="page"` for
 * assistive tech and a gold bar as the sighted cue.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { THERAPIST_NAV, resolveTherapistNavItem, type TherapistNavItem } from './navigation';

interface TherapistNavListProps {
  readonly pathname: string;
  readonly onNavigate?: () => void;
}

function NavRow({
  item,
  active,
  onNavigate,
}: {
  item: TherapistNavItem;
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
      </Link>
    </li>
  );
}

export function TherapistNavList({ pathname, onNavigate }: TherapistNavListProps) {
  const activeItem = resolveTherapistNavItem(pathname);

  return (
    <nav aria-label="Therapist workspace">
      <p className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-white/40">
        Workspace
      </p>
      <ul className="flex flex-col gap-0.5">
        {THERAPIST_NAV.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            active={activeItem?.href === item.href}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </nav>
  );
}
