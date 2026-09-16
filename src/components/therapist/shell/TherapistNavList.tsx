'use client';

/**
 * The therapist workspace's navigation list, shared by the desktop rail and
 * the mobile drawer. Structurally identical to the admin console's
 * `AdminNavList` — same link pattern, same active state, same accessibility.
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
      </Link>
    </li>
  );
}

export function TherapistNavList({ pathname, onNavigate }: TherapistNavListProps) {
  const activeItem = resolveTherapistNavItem(pathname);

  return (
    <nav aria-label="Therapist workspace" className="mt-6 flex-1 overflow-y-auto">
      <p className="px-2.5 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/40">
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
