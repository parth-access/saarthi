import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/verifySession';
import { TherapistPostSessionService } from '@/services/therapistPostSessionService';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Client-facing session summary.
 *
 * Returns the summary ONLY when the therapist explicitly shared it
 * (clientSummaryShared === true). Private therapist notes are NEVER included
 * in this response. Authorization: booking owner (uid or verified email) only.
 * Manage-booking tokens intentionally cannot access this endpoint — it requires
 * an authenticated session.
 */
export async function GET(req: Request, { params }: { params: Promise<{ bookingId: string }> }) {
  try {
    const session = await verifySession(req);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Please sign in to view your session summary.' }, { status: 401 });
    }

    const { bookingId } = await params;

    const result = await TherapistPostSessionService.getClientSummary(bookingId, {
      uid: session.uid,
      email: session.email,
    });

    if (!result.success) {
      const status = result.error?.startsWith('Unauthorized') ? 403 : 404;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({ success: true, summary: result.summary });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('SUMMARY_API', 'Failed to fetch client session summary', { error: errorMsg });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
