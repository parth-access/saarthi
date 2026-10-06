import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SessionReminderService } from '@/services/sessionReminderService';
import { logger } from '@/app/api/_lib/logger';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { isReadableBookingId } from '@/app/api/admin/bookings/[bookingId]/bookingIdGuard';

export const dynamic = 'force-dynamic';

/**
 * "Send reminder now" for one booking — the manual counterpart to the scheduled
 * reminder job, wired to the booking detail screen.
 *
 * The service's own semantics are the safety here, and the route preserves them
 * untouched: only confirmed, paid bookings with a Meet link; skipped honestly
 * (as a 200 with a reason) when not yet due or the window has passed; idempotent
 * through `reminderStatus` unless explicitly forced. A failure the service
 * reports keeps its 500; the raw error string this route used to echo is gone —
 * the reason lives on the booking as `reminderError`, where the detail screen
 * reads it after a reload.
 */
const GENERIC_REMINDER_ERROR =
  'The reminder did not go out just now. The booking records what happened — reload to read it.';

const reminderRequestSchema = z.object({
  bookingId: z.string().min(1).max(128),
  force: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  // Admin authorization flows through the CANONICAL source of truth: the
  // `users` collection role, re-read live on every request (via
  // verifySession). The previous Firebase custom-claims check here was a
  // second admin authority that could disagree with the users collection —
  // locking out provisioned admins when claims were absent, or keeping
  // stale claims alive after a role change.
  const authResult = await requireAdmin(req as unknown as Request);
  if (authResult instanceof NextResponse) return authResult;

  const limit = checkRateLimit(getClientIp(req), 'admin_reminder_send', 10, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many reminder requests in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let bookingId: string;
  let force: boolean;
  try {
    const parsed = reminderRequestSchema.safeParse(await req.json());
    if (!parsed.success || !isReadableBookingId(parsed.data.bookingId)) {
      return NextResponse.json({ error: 'bookingId is required and must be a readable booking id.' }, { status: 400 });
    }
    bookingId = parsed.data.bookingId;
    force = parsed.data.force === true;
  } catch {
    return NextResponse.json({ error: 'A JSON body with bookingId is required.' }, { status: 400 });
  }

  logger.info('ADMIN_REMINDER', `Admin triggered session reminder for booking ${bookingId}`, { force });

  let result: Awaited<ReturnType<typeof SessionReminderService.sendSessionReminder>>;
  try {
    result = await SessionReminderService.sendSessionReminder(bookingId, { force });
  } catch (err) {
    logger.error('ADMIN_REMINDER', 'Error in admin reminder send API', err, { bookingId });
    return NextResponse.json({ error: GENERIC_REMINDER_ERROR }, { status: 500 });
  }

  if (result.success) {
    return NextResponse.json({
      success: true,
      alreadySent: result.alreadySent,
      studentSent: result.studentSent,
      therapistSent: result.therapistSent,
      message: result.alreadySent
        ? 'Reminder was already previously sent for this booking.'
        : 'Session reminder email dispatched successfully.',
    });
  }

  // A skip is a known, honest outcome — not an error — so it stays a 200 with
  // the reason attached. A hard failure is a 500 with the fixed sentence: the
  // reason lives on the booking as reminderError, where the detail screen reads
  // it after a reload.
  return NextResponse.json({
    success: false,
    skippedReason: result.skippedReason ?? null,
    error: result.skippedReason ?? GENERIC_REMINDER_ERROR,
  }, { status: result.skippedReason ? 200 : 500 });
}
