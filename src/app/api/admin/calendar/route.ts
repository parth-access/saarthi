import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readCalendarProblems, CALENDAR_SCAN_LIMIT } from './calendarSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The Calendar & Meet list: confirmed sessions with no Meet link.
 *
 * This is the same set the scheduled calendar job acts on, listed rather than
 * counted, with each row's recorded `calendarError` so an operator can decide
 * whether the fix is a retry, a configuration change, or nothing the console
 * can do. Retry itself is a separate, authenticated POST — this handler only
 * reads.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const problems = await readCalendarProblems();
    return NextResponse.json(
      { success: true, generatedAtIso: new Date().toISOString(), problems, scanLimit: CALENDAR_SCAN_LIMIT },
      {
        headers: {
          // A queue that a five-minute job is also working is stale the moment
          // it is cached, and the response is scoped to one admin's session.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    logger.error('SYSTEM', 'Admin calendar list failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the calendar list right now. Please try again.' },
      { status: 500 }
    );
  }
}
