import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { GoogleCalendarService } from '@/services/googleCalendarService';
import { auditService } from '@/domains/audit/AuditService';
import { logger } from '@/app/api/_lib/logger';

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Admin Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: missing token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    if (decodedToken.role !== 'admin' && !decodedToken.admin) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { bookingId } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    await auditService.logEvent(
      'CALENDAR_CREATION_RETRY',
      { bookingId, triggeredBy: decodedToken.uid },
      decodedToken.uid,
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
