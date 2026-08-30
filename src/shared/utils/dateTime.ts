/**
 * Utility for parsing and formatting date-times with Asia/Kolkata (IST) timezone semantics.
 */

/**
 * Converts a date ('YYYY-MM-DD') and time ('HH:mm') in IST to UTC ISO string.
 * IST is UTC+05:30 throughout the entire year (no Daylight Saving Time).
 */
export function istToUtcIsoString(date: string, time: string): string {
  try {
    const [yearStr, monthStr, dayStr] = date.split('-');
    const [hoursStr, minutesStr] = time.split(':');

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return '';
    }

    // Offset in milliseconds for IST (UTC+05:30)
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    
    // Construct UTC timestamp corresponding to the given IST wall-clock time
    const utcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0) - IST_OFFSET_MS;
    return new Date(utcTimestamp).toISOString();
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

