/**
 * Lightweight client-side performance stage tracing.
 *
 * Used to measure the authentication and availability critical paths
 * (AUTH_INIT → AUTH_READY, AVAILABILITY_START → AVAILABILITY_RENDERED, …).
 *
 * Design constraints:
 * - Records only durations (ms). Never tokens, cookies, identifiers or any
 *   user content.
 * - Logs through the existing frontend logger, which is dev-only for
 *   non-error levels — so production console output stays quiet.
 * - Failures must never affect application logic.
 */

import { logger } from '@/utils/logger';

const marks = new Map<string, number>();

export type PerfCategory = 'AUTH' | 'UI' | 'SYSTEM';

/** Record a named point in time. Overwriting a mark is safe and expected. */
export function perfMark(name: string): void {
  try {
    marks.set(name, Date.now());
  } catch {
    // Tracing must never throw.
  }
}

/**
 * Measure elapsed time from a previously set mark. Returns the duration in
 * milliseconds, or null when the mark does not exist. Dev-only log.
 */
export function perfMeasure(
  stage: string,
  fromMark: string,
  category: PerfCategory = 'SYSTEM'
): number | null {
  try {
    const start = marks.get(fromMark);
    if (start === undefined) return null;
    const durationMs = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      logger.info(category, `[perf] ${stage}: ${durationMs}ms (from ${fromMark})`);
    }
    return durationMs;
  } catch {
    return null;
  }
}

/** Test/debug helper: read a raw mark without logging. */
export function perfPeek(name: string): number | undefined {
  return marks.get(name);
}
