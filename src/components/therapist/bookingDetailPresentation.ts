/**
 * Presentation primitives for the therapist booking detail screen.
 * Split from the screen so each file stays small and testable; the shapes
 * deliberately mirror the admin console's Field/Card/Badge conventions.
 */
import type { FirebaseTimestamp } from '@/types';

export const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  completed: { label: 'Completed', className: 'bg-primary/5 text-primary border-primary/10' },
  pending: { label: 'Awaiting approval', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending_approval: { label: 'Awaiting approval', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  awaiting_payment: { label: 'Awaiting payment', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  rejected: { label: 'Declined', className: 'bg-red-50 text-red-600 border-red-100' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-50 text-gray-500 border-gray-100' },
  no_show: { label: 'No-show', className: 'bg-red-50 text-red-600 border-red-100' },
  expired: { label: 'Expired', className: 'bg-gray-50 text-gray-500 border-gray-100' },
};

export function statusBadgeFor(status: string): { label: string; className: string } {
  return (
    STATUS_BADGES[status] ?? {
      label: status.replace(/_/g, ' '),
      className: 'bg-primary/5 text-primary border-primary/10',
    }
  );
}

export function humanize(value: string): string {
  return value.replace(/_/g, ' ');
}

export function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === 'object') {
    const v = value as { toMillis?: () => number; toDate?: () => Date };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.toDate === 'function') return v.toDate().getTime();
  }
  return null;
}

export function formatTimestamp(value: FirebaseTimestamp | Date | string | null | unknown): string {
  const ms = toMillis(value);
  if (ms === null) return '—';
  return new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
