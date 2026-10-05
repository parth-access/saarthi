/**
 * Utility for parsing and formatting date-times with Asia/Kolkata (IST) timezone semantics.
 */

/**
 * Converts a date ('YYYY-MM-DD') and time ('HH:mm') in IST to UTC ISO string.
 * IST is UTC+05:30 throughout the entire year (no Daylight Saving Time).
 *
 * Returns '' for anything that is not a real IST wall-clock instant. Each
 * component is range-checked and the result is round-tripped, because
 * `Date.UTC` silently rolls overflow over: `2026-13-45` would otherwise become
 * 2027-01-14 and `2026-02-30` would become 2026-03-02. Callers validate only the
 * *shape* (`/^\d{4}-\d{2}-\d{2}$/`), so without this a client could book or
 * reschedule to a date it never named.
 */
export function istToUtcIsoString(date: string, time: string): string {
  try {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date).trim());
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
    if (!dateMatch || !timeMatch) {
      return '';
    }

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const day = parseInt(dateMatch[3], 10);
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    if (month < 1 || month > 12) return '';
    if (day < 1 || day > 31) return '';
    if (hours < 0 || hours > 23) return '';
    if (minutes < 0 || minutes > 59) return '';

    // Offset in milliseconds for IST (UTC+05:30)
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

    // Construct UTC timestamp corresponding to the given IST wall-clock time
    const asUtcMidnightRef = new Date(Date.UTC(year, month - 1, day));
    // Rejects impossible calendar days (2026-02-30, 2026-04-31) rather than
    // letting them roll into the following month.
    if (
      asUtcMidnightRef.getUTCFullYear() !== year ||
      asUtcMidnightRef.getUTCMonth() !== month - 1 ||
      asUtcMidnightRef.getUTCDate() !== day
    ) {
      return '';
    }

    const utcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0) - IST_OFFSET_MS;
    const result = new Date(utcTimestamp);
    return isNaN(result.getTime()) ? '' : result.toISOString();
  } catch {
    return '';
  }
}

/**
 * Universal Timestamp/Date parsing utility.
 * Reliably parses Firestore Timestamp, Date object, ISO string, milliseconds number, or null/undefined.
 */
export function toStandardDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'object') {
    // Firestore Timestamp or object with toDate()
    if ('toDate' in value && typeof (value as { toDate: () => unknown }).toDate === 'function') {
      try {
        const d = (value as { toDate: () => unknown }).toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {
        // fallback
      }
    }
    // Firestore Timestamp with seconds / _seconds
    const sec = (value as { seconds?: unknown; _seconds?: unknown }).seconds ?? (value as { _seconds?: unknown })._seconds;
    if (typeof sec === 'number') {
      const nanosec = (value as { nanoseconds?: unknown; _nanoseconds?: unknown }).nanoseconds ?? (value as { _nanoseconds?: unknown })._nanoseconds;
      const ms = sec * 1000 + (typeof nanosec === 'number' ? Math.floor(nanosec / 1000000) : 0);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

