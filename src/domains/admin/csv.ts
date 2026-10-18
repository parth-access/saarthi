/**
 * Minimal, safe CSV writer.
 *  - RFC 4180 quoting (commas, quotes, newlines).
 *  - Formula-injection guard: a cell starting with = + - @ (or tab/CR) is
 *    prefixed with ' so Excel / Sheets never evaluate client-typed text.
 *  - Leading BOM so Excel opens UTF-8 (₹, names in Hindi) correctly.
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Firestore Timestamp / Date / ISO string → "YYYY-MM-DD HH:mm" in IST, or ''. */
export function istDateTime(value: unknown): string {
  let ms: number | null = null;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'string') ms = Date.parse(value);
  else if (value && typeof value === 'object' && typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    ms = (value as { toMillis: () => number }).toMillis();
  }
  if (ms === null || !Number.isFinite(ms)) return '';
  return new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}
