import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SessionReminderService } from '@/services/sessionReminderService';
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
    const { bookingId, force } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    logger.info('ADMIN_REMINDER', `Admin triggered session reminder for booking ${bookingId}`, { force });

    const result = await SessionReminderService.sendSessionReminder(bookingId, { force: !!force });

    if (result.success) {
      return NextResponse.json({
        success: true,
        alreadySent: result.alreadySent,
        studentSent: result.studentSent,
        therapistSent: result.therapistSent,
        message: result.alreadySent 
          ? 'Reminder was already previously sent for this booking.' 
          : 'Session reminder email dispatched successfully.'
      });
    } else {
      return NextResponse.json({
        success: false,
        skippedReason: result.skippedReason,
        error: result.error || result.skippedReason || 'Failed to dispatch session reminder'
      }, { status: result.skippedReason ? 200 : 500 });
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('ADMIN_REMINDER', 'Error in admin reminder send API', err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
