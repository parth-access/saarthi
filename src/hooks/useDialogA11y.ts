"use client";

/**
 * Keyboard + screen-reader behaviour for hand-rolled modal dialogs.
 *
 * Mirrors what `admin/ConfirmDialog.tsx` already does, as a hook so the
 * client-facing dialogs (cancel, reschedule, review, support, session details,
 * payment-confirming overlay) get the same guarantees:
 *
 *  - Focus moves into the dialog on open: the first field if there is one,
 *    otherwise the panel itself. Never a committing button, so a stray
 *    Enter/Space cannot submit.
 *  - Tab / Shift+Tab are contained inside the panel.
 *  - Escape closes it, unless `dismissible` is false (a request is in flight).
 *  - Focus returns to whatever opened the dialog when it closes.
 *  - Page scroll is locked while open. Locks are reference-counted so two
 *    overlays can't leave the page stuck or unlocked.
 *  - When dialogs stack, only the topmost handles Escape and Tab.
 *
 * The caller still owns the markup: put `ref={panelRef}`, `tabIndex={-1}`,
 * `role="dialog"` (or `"alertdialog"`), `aria-modal="true"` and
 * `aria-labelledby` on the panel element.
 */
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;
let overflowBeforeLock = "";

function lockScroll() {
  if (scrollLocks === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = overflowBeforeLock;
}

// Open dialogs, oldest first. Only the last one reacts to the keyboard.
const openDialogs: symbol[] = [];

interface UseDialogA11yOptions {
  /** True while the dialog's panel is actually rendered. */
  isOpen: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  /** Set false to block Escape while a request is in flight. Default true. */
  dismissible?: boolean;
}

export function useDialogA11y({
  isOpen,
  onClose,
  panelRef,
  dismissible = true,
}: UseDialogA11yOptions) {
  // Latest values, read from the key handler without re-running the open effect
  // (re-running it would steal focus back to the first field on every render).
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!isOpen) return;

    const id = Symbol("dialog");
    openDialogs.push(id);
    // Captured now: by cleanup time the opener may be unmounted and
    // document.activeElement would be <body>.
    const returnFocusTo = document.activeElement as HTMLElement | null;
    lockScroll();

    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>(
      "input:not([disabled]),textarea:not([disabled]),select:not([disabled])"
    );
    (firstField ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== id) return;

      if (event.key === "Escape") {
        if (!dismissibleRef.current) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const current = panelRef.current;
      if (!current) return;

      const focusable = Array.from(
        current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((node) => node.offsetParent !== null || node === document.activeElement);

      if (focusable.length === 0) {
        event.preventDefault();
        current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Capture phase so the trap sees Tab before any field handler does.
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = openDialogs.indexOf(id);
      if (index !== -1) openDialogs.splice(index, 1);
      unlockScroll();
      if (returnFocusTo && returnFocusTo.isConnected) returnFocusTo.focus?.();
    };
  }, [isOpen, panelRef]);
}
