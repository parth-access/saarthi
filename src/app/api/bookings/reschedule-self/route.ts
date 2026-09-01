import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/lib/auth/verifySession';
import { RescheduleBookingCommand, RescheduleBookingCommandHandler } from '@/domains/booking';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    bookingId: z.string().min(1),
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    newTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  })
  .strict();

/**
 * Client self-service reschedule.
 *
 * Runs the canonical RescheduleBookingCommand (atomic slot swap + Google
 * Calendar/Meet update via the outbox listener) for the *logged-in owner* of
 * the booking. Ownership is enforced inside the command against the verified
 * session (uid OR verified email) — the client-sent bookingId is never trusted
 * on its own.
 */
export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'reschedule_self', 10, 60000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many reschedule attempts. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Please sign in to reschedule this session.' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Please choose a valid new date and time.' },
        { status: 400 }
      );
    }

    const { bookingId, newDate, newTime } = parsed.data;

    const command = new RescheduleBookingCommand(bookingId, newDate, newTime, {
      uid: session.uid,
      email: session.email,
      role: session.role,
    });
    const handler = new RescheduleBookingCommandHandler();
    const booking = await handler.execute(command);

    logger.info('BOOKING', 'Booking rescheduled by client (self-service)', {
      bookingId,
      newDate,
      newTime,
      uid: session.uid,
    });

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        date: booking.date,
        time: booking.time,
        status: booking.status,
        meetingUrl: booking.meetingUrl ?? null,
        calendarStatus: booking.calendarStatus ?? null,
      },
    });
  } catch (error) {
    logger.error('BOOKING', 'Client self-service reschedule failed', error);
    const rawMsg = error instanceof Error ? error.message : String(error);

    // Slot conflicts — retriable, user should pick another slot.
    if (rawMsg.includes('unavailable') || rawMsg.includes('already booked') || rawMsg.includes('outside the therapist')) {
      return NextResponse.json(
        { success: false, error: 'That slot is no longer available. Please pick another time.' },
        { status: 409 }
      );
    }
    // Ownership / not found.
    if (rawMsg.includes('Unauthorized')) {
      return NextResponse.json({ success: false, error: 'You are not allowed to reschedule this session.' }, { status: 403 });
    }
    if (rawMsg.includes('not found')) {
      return NextResponse.json({ success: false, error: 'We could not find this session.' }, { status: 404 });
    }
    // Policy / validation (past date, 14-day window, completed/cancelled, bad format).
    if (
      rawMsg.includes('past') ||
      rawMsg.includes('14 days') ||
      rawMsg.includes('completed') ||
      rawMsg.includes('cancelled') ||
      rawMsg.includes('rejected') ||
      rawMsg.includes('format')
    ) {
      return NextResponse.json({ success: false, error: rawMsg }, { status: 400 });
    }

    return NextResponse.json(
      { success: false, error: 'We could not reschedule your session right now. Please try again shortly.' },
      { status: 500 }
    );
  }
}
