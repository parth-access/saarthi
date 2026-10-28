'use client';

/**
 * ⌘K: jump to any section, open a booking by id, or run a bookings lookup by
 * email, phone or name — from any admin page.
 *
 * ARIA combobox pattern: focus stays in the input, arrow keys move the active
 * option (announced through `aria-activedescendant`), Enter follows it, Escape
 * or a click outside closes. Results are links, so a middle-click still opens
 * one in a new tab.
 */
import { ArrowRight, CornerDownLeft, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { PALETTE_GROUP_LABELS, paletteResults, type PaletteEntry } from './commandPaletteModel';

export function AdminCommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const results = useMemo(() => paletteResults(query), [query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Lock the page behind the dialog so the wheel scrolls the results only.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const go = (entry: PaletteEntry) => {
    onClose();
    router.push(entry.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
    } else if (event.key === 'Enter') {
      const entry = results[active];
      if (entry) {
        event.preventDefault();
        go(entry);
      }
    }
  };

  let lastGroup: string | null = null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh] sm:px-4">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search the admin console"
        onKeyDown={onKeyDown}
        className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-hairline px-4">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-primary/50" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Booking ID, email, phone, client name, or a page…"
            className="h-14 w-full bg-transparent text-[0.9375rem] text-text placeholder:text-muted-foreground/70 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>

        <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-2">
          {results.map((entry, index) => {
            const heading = entry.group !== lastGroup ? PALETTE_GROUP_LABELS[entry.group] : null;
            lastGroup = entry.group;
            const isActive = index === active;
            return (
              <li key={entry.id} role="presentation">
                {heading && (
                  <p
                    role="presentation"
                    className="px-2.5 pb-1 pt-3 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground first:pt-1"
                  >
                    {heading}
                  </p>
                )}
                <Link
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isActive}
                  data-index={index}
                  href={entry.href}
                  tabIndex={-1}
                  onMouseMove={() => setActive(index)}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    go(entry);
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors',
                    isActive ? 'bg-primary/[0.07]' : ''
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary">{entry.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{entry.hint}</span>
                  </span>
                  {isActive ? (
                    <CornerDownLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary/60" />
                  ) : (
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary/25" />
                  )}
                </Link>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches that.</li>
          )}
        </ul>

        <div className="hidden items-center gap-4 border-t border-hairline bg-neutral-surface/50 px-4 py-2 text-[0.6875rem] text-muted-foreground sm:flex">
          <span><kbd className="font-semibold">↑↓</kbd> to move</span>
          <span><kbd className="font-semibold">Enter</kbd> to open</span>
          <span><kbd className="font-semibold">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
