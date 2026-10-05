import { NextRequest, NextResponse } from 'next/server';
import { GoogleCalendarService } from '@/services/googleCalendarService';
import { auditService } from '@/domains/audit/AuditService';
import { logger } from '@/app/api/_lib/logger';
import { requireAdmin } from '@/lib/auth/requireRole';

export async function POST(req: NextRequest) {
  try {
    // Admin authorization flows through the CANONICAL source of truth: the
    // `users` collection role, re-read live on every request (via
    // verifySession). The previous Firebase custom-claims check here was a
    // second admin authority that could disagree with the users collection —
    // locking out provisioned admins when claims were absent, or keeping
    // stale claims alive after a role change.
    const authResult = await requireAdmin(req as unknown as Request);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const { bookingId } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    await auditService.logEvent(
      'CALENDAR_CREATION_RETRY',
      { bookingId, triggeredBy: session.uid },
      session.uid,
      bookingId
    );

    logger.info('ADMIN_CALENDAR', `Admin triggered retry calendar event for booking ${bookingId}`);

    const result = await GoogleCalendarService.createOrSyncCalendarEvent(bookingId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Google Calendar event & Meet conference successfully created.',
        meetingUrl: result.meetingUrl,
        calendarEventId: result.calendarEventId
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to create Google Calendar event'
      }, { status: 500 });
    }

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('ADMIN_CALENDAR', 'Error retrying calendar event creation', { error: errorMsg });
    return NextResponse.json({ error: 'Internal server error: ' + errorMsg }, { status: 500 });
  }
}
