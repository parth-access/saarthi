import { NextRequest, NextResponse } from 'next/server';
import { SessionReminderService } from '@/services/sessionReminderService';
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
