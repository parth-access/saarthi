import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readJobsEmails, readJobsOutbox, JOBS_SCAN_LIMIT } from './jobsSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The Background jobs list: the outbox's waiting, stuck and dead slices, and the
 * email queue's in-flight and failed slices.
 *
 * A read-only counterpart to `POST /api/operations/replay` — every action this
 * screen offers goes through that endpoint and its allow-list, never through
 * here. The response is a set of independently-fallible slices: one unreadable
 * collection is a named gap on the page, not a 500 and not an empty queue.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const [outbox, emails] = await Promise.all([readJobsOutbox(), readJobsEmails()]);
    return NextResponse.json(
      {
        success: true,
        generatedAtIso: new Date().toISOString(),
        outbox,
        emails,
        scanLimit: JOBS_SCAN_LIMIT,
      },
      {
        headers: {
          // The processor runs every five minutes; a cached queue is a lie.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    logger.error('SYSTEM', 'Admin jobs list failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the background jobs right now. Please try again.' },
      { status: 500 }
    );
  }
}
