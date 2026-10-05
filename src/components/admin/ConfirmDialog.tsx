'use client';

/**
 * The dialog an operator sees before a consequential write.
 *
 * Purpose-built rather than reusing `src/components/ui/Modal.tsx`, which the
 * public booking flow depends on and which is missing everything that matters
 * here: no Escape key, no focus containment, no `role="dialog"`, and an `<h3>`
 * title that would collide with the admin detail screen's heading levels.
 * Changing the shared one to suit this would put the client-facing flows at risk
 * for no gain.
 *
 * Four behaviours are deliberate and each prevents a specific accident:
 *
 *  - **The confirm button is never autofocused.** Focus lands on the dialog
 *    itself, or on the first field. An operator who opens a cancellation dialog
 *    and hits Enter or Space out of habit must not have cancelled a booking.
 *  - **Escape and the backdrop close it, and closing is never a submit.** The
 *    only way to commit is to press the one labelled button.
 *  - **Focus is contained while open and returned to the trigger on close**, so
 *    a keyboard operator is not dropped at the top of the document, and Tab
 *    cannot wander onto the action bar behind the dialog and press it.
 *  - **Both buttons are disabled while the request is in flight**, and the
 *    dialog does not close itself on submit. The result is reported in place.
 *    Closing optimistically is how a double-submit happens.
 *
 * There is no `framer-motion` here on purpose: an animated entrance on a
 * confirmation dialog delays the moment the text can be read.
 */
import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface ConfirmDialogProps {
  title: string;
  /** Short line under the title naming what is being acted on. */
  subtitle?: string;
  children: React.ReactNode;
  /** Rendered in the footer: the single committing button, plus anything else. */
  footer: React.ReactNode;
  onClose: () => void;
  /** Blocks Escape and the backdrop while a write is in flight. */
  busy?: boolean;
}

export function ConfirmDialog({
  title,
  subtitle,
  children,
  footer,
  onClose,
  busy = false,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Captured on mount rather than read on unmount: by then the dialog's own
  // button may already have been removed and `document.activeElement` is `<body>`.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    // Not while a write is in flight. Dismissing then would leave the operator with
    // no report of what the server did, which is the one thing they need.
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // The first field when there is one — a cancellation reason should be typeable
    // immediately — and otherwise the panel, never the committing button.
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>('input,textarea,select');
    (firstField ?? panel)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement
      );
      if (focusable.length === 0) {
        // Nothing to move to, so Tab must not escape to the page behind.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Capture phase: a keystroke must not reach a field's own handler and be
    // treated as text before the trap has seen it.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [requestClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      {/* Not a button: a backdrop that announces itself is noise to a screen
          reader, and Escape already provides the accessible dismissal. */}
      <div
        aria-hidden="true"
        onClick={requestClose}
        className="absolute inset-0 bg-primary/30 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            {/* h2: the admin shell owns the page's h1, and this dialog is a peer of
                the screen's own sections rather than a child of one. */}
            <h2 id={titleId} className="text-sm font-semibold text-primary">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close without acting"
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-neutral-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <div id={descriptionId} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-neutral-surface/50 px-4 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}
