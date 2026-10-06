import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readActivityPage, planActivityQuery } from './activitySources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The activity log: a paged, filtered read of `timelines` — the record of what
 * actors did and what the system did in response. Per-booking audit history
 * lives on the booking detail screen; this is the cross-booking stream.
 *
 * The query plan refuses unsupported filter combinations with an explanation,
 * every page is bounded, and the only ordering is the declared one. A failed
 * read is reported as data — an activity log that failed must never render as
 * "nothing happened".
 */
export async function GET(req: NextRequest) {
  const authorized = await requireAdmin(req as unknown as Request);
  if (authorized instanceof NextResponse) return authorized;

  const sp = new URL(req.url).searchParams;
  const plan = planActivityQuery({
    correlationId: sp.get('correlationId'),
    bookingId: sp.get('bookingId'),
    severity: sp.get('severity'),
    event: sp.get('event'),
    actorType: sp.get('actorType'),
    pageSize: sp.get('pageSize'),
  });

  if (!plan.ok) {
    return NextResponse.json(
      { success: false, error: plan.message, code: plan.code },
      { status: 400 }
    );
  }

  let cursor: { createdAtMs: number; id: string } | null = null;
  const rawCursor = sp.get('cursor');
  if (rawCursor) {
    const match = /^(\d+)_([A-Za-z0-9_.-]+)$/.exec(rawCursor);
    if (!match) {
      return NextResponse.json(
        { success: false, error: 'That page cursor is not valid. Go back to the first page.' },
        { status: 400 }
      );
    }
    cursor = { createdAtMs: Number(match[1]), id: match[2] };
  }

  try {
    const result = await readActivityPage({ filter: plan.filter, pageSize: plan.pageSize, cursor });
    if (!result.ok) {
      return NextResponse.json(
        { success: true, activity: { ok: false, reason: result.reason } },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    const nextCursor = result.page.nextCursor
      ? `${result.page.nextCursor.createdAtMs}_${result.page.nextCursor.id}`
      : null;
    return NextResponse.json(
      {
        success: true,
        generatedAtIso: new Date().toISOString(),
        activity: { ok: true, entries: result.page.entries, hasMore: result.page.hasMore },
        nextCursor,
        appliedFilter: plan.filter,
        pageSize: plan.pageSize,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('SYSTEM', 'Admin activity failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the activity log right now. Please try again.' },
      { status: 500 }
    );
  }
}
