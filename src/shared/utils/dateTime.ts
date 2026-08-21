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
