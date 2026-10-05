'use client';

/**
 * An id, and a button that really copies it.
 *
 * `navigator.clipboard` is unavailable over plain HTTP and can be denied by
 * permission policy, so a failure is reported rather than swallowed — a button
 * that says "Copied" while the clipboard still holds something else leads to the
 * wrong booking id being pasted into a refund.
 *
 * Shared by the table and the detail header so both report failure the same way.
 */
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CopyableIdProps {
  readonly id: string;
  /** What is being copied, for the button's accessible name. */
  readonly label?: string;
  /** Larger type for the detail header, where the id is a heading, not a cell. */
  readonly size?: 'sm' | 'md';
}

export function CopyableId({ id, label = 'booking id', size = 'sm' }: CopyableIdProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  // Without this, the reset fires after the row has gone — a state update on an
  // unmounted component, and a warning in the console on every filter change.
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(id);
      setState('copied');
    } catch {
      setState('failed');
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };

  const idClasses =
    size === 'md'
      ? 'rounded bg-neutral-surface px-1.5 py-0.5 font-mono text-xs text-primary/80'
      : 'truncate rounded bg-neutral-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-primary/80';

  return (
    <div className="flex items-center gap-1">
      <code className={idClasses}>{id}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label} ${id}`}
        title={
          state === 'failed'
            ? 'Could not reach the clipboard — select the id manually.'
            : `Copy ${label}`
        }
        className="rounded-md p-1 text-primary/50 hover:bg-neutral-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {state === 'copied' ? (
          <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>
      {/* Announced, not just coloured: the icon change alone is invisible to a
          screen reader and to anyone not looking at that corner of the row. */}
      <span role="status" aria-live="polite" className="text-[0.6875rem] text-muted-foreground">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </div>
  );
}
