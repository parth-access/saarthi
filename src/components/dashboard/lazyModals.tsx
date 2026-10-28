'use client';

/**
 * The dashboard's dialogs, loaded the first time one is opened rather than with
 * the page. Each carries its own animation and logic (the reschedule picker
 * reads availability), and most visits open none of them.
 *
 * Pair each with `useOpenedOnce`: mount the dialog once it has been opened and
 * keep it mounted after, so its closing animation still plays.
 */
import dynamic from 'next/dynamic';
import { useState } from 'react';

export const SessionDetailsModal = dynamic(
  () => import('./SessionDetailsModal').then((m) => m.SessionDetailsModal),
  { ssr: false }
);
export const RescheduleModal = dynamic(() => import('./RescheduleModal').then((m) => m.RescheduleModal), {
  ssr: false,
});
export const CancelModal = dynamic(() => import('./CancelModal').then((m) => m.CancelModal), { ssr: false });
export const SupportModal = dynamic(() => import('./SupportModal').then((m) => m.SupportModal), { ssr: false });

/** True from the first time `open` is true, for good. */
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened || open;
}
