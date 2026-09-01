import { SESSION_DURATION_MINUTES } from '@/shared/constants';

/**
 * Client-safe helpers for presenting a booking's session time.
 *
 * Session length is the shared SESSION_DURATION_MINUTES (50 min) — the same
 * block the Google Calendar event uses. These helpers never touch I/O and are
 * safe in client components.
 */

/** Parse "HH:MM" (24h) into minutes since midnight; null if unparseable. */
function parseHhMm(time: string | undefined | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Format minutes-since-midnight as "9:00 AM". */
function formatMinutes(total: number): string {
  const h24 = Math.floor(total / 60) % 24;
  const min = total % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}

export const SESSION_DURATION_LABEL = `${SESSION_DURATION_MINUTES} min`;

/**
 * Build a "9:00 AM – 9:50 AM" range from the stored start time using the real
 * 50-minute session length. Falls back to the raw stored time when it can't be
 * parsed (never shows NaN/undefined).
 */
export function formatSessionTimeRange(time: string | undefined | null): string {
  const start = parseHhMm(time);
  if (start === null) return time || '—';
  const end = start + SESSION_DURATION_MINUTES;
  return `${formatMinutes(start)} – ${formatMinutes(end)}`;
}

/** Just the start, in 12-hour form; raw fallback. */
export function formatStartTime(time: string | undefined | null): string {
  const start = parseHhMm(time);
  if (start === null) return time || '—';
  return formatMinutes(start);
}

/**
 * Friendly date. Interprets "YYYY-MM-DD" as a calendar date (no TZ shift) and
 * returns e.g. "Mon, 8 Sep 2026". Falls back to the raw string.
 */
export function formatSessionDate(date: string | undefined | null): string {
  if (!date) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Short weekday + day, e.g. "Mon 8". */
export function formatDayBadge(date: string | undefined | null): { weekday: string; day: string } | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return null;
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    day: d.toLocaleDateString('en-GB', { day: 'numeric' }),
  };
}

/**
 * Best-effort session start instant (ms). Prefers the stored UTC timestamp,
 * else interprets the IST-local date/time. NaN when neither parses.
 */
export function sessionStartMs(booking: { utcDateTime?: string; date?: string; time?: string }): number {
  if (booking.utcDateTime) {
    const t = Date.parse(booking.utcDateTime);
    if (Number.isFinite(t)) return t;
  }
  if (booking.date && booking.time) {
    const t = Date.parse(`${booking.date}T${booking.time}:00+05:30`);
    if (Number.isFinite(t)) return t;
  }
  return NaN;
}

/** Whether the session start is still in the future. */
export function isUpcoming(booking: { utcDateTime?: string; date?: string; time?: string }, now = Date.now()): boolean {
  const start = sessionStartMs(booking);
  return Number.isFinite(start) ? start > now : false;
}
