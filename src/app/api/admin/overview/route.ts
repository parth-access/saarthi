import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readAdminOverview } from './overviewSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The admin overview: what needs attention right now.
 *
 * Six counts, today's sessions, and a reading of the background machinery — every
 * figure derived from `bookings`, `refunds`, `outbox_events` or `emails` documents.
 * Nothing is read from `daily_metrics`, whose day is keyed by the UTC date (so
 * "today" would begin at 5:30 AM IST) and whose `bookingsCreated` counts slot
 * holds, most of which are abandoned. A tile fed from it would be a wrong number
 * with a plausible name, which is worse than no tile.
 *
 * This route replaces `GET /api/operations/dashboard` for the console's landing
 * page. That endpoint reports `workerStatus: 'active'` unconditionally, a
 * `lastPoll` that is the current request's own timestamp, and `firebase`,
 * `resend` and `razorpay` as `'healthy'` whenever their environment variables are
 * set — none of which observes anything. It also downloads every queued and
 * failed email just to read `.size`, and returns `error.message` to the browser
 * on failure. Deleting it is increment 8; not building on it is now.
 *
 * The response is a set of independently-fallible readings, not a status. Each
 * source that failed comes back as `{ ok: false, reason }` with a fixed sentence,
 * so the UI can show a gap where a number should be. A 500 from this handler
 * means the assembly itself broke, which the readers are written to prevent.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const overview = await readAdminOverview();
    return NextResponse.json(
      { success: true, ...overview },
      {
        headers: {
          // An operations queue is stale the moment it is cached, and this
          // response is scoped to one admin's session.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    // Every source already catches its own failure, so reaching here means the
    // assembly broke rather than a collection being unreadable. The raw error —
    // which for Firestore carries the project id and an index-creation URL — goes
    // to the server log only.
    logger.error('SYSTEM', 'Admin overview failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the overview right now. Please try again.' },
      { status: 500 }
    );
  }
}
