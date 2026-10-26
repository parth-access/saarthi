import { NextResponse } from "next/server";
import { getClientIp } from '../_lib/rateLimit';
import { checkDistributedRateLimit } from '../_lib/distributedRateLimit';
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin';
import { logger } from "../_lib/logger";
import { firestoreBookingRepository, RescheduleBookingCommand, RescheduleBookingCommandHandler } from "@/domains/booking";

/** Short, non-reversible correlation marker for a booking token — never log the token itself. */
function fingerprintToken(token: string): string {
  return `${token.slice(0, 6)}…(len ${token.length})`;
}

/** Shared across serverless instances — this route accepts a bearer token. */
async function isRateLimited(ip: string): Promise<boolean> {
  const result = await checkDistributedRateLimit(ip, 'manage_booking', 10, 60_000);
  return !result.success;
}

/** Manage links stop working this many days after the session date. */
const TOKEN_GRACE_DAYS = 7;

/** Statuses after which a manage link may still view, but never change, a booking. */
const READ_ONLY_STATUSES = new Set(['cancelled', 'completed', 'rejected', 'no_show', 'expired']);

/** Today's date in IST as YYYY-MM-DD. */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A manage token is a long-lived bearer credential sent by email, so it is
 * bounded by the booking itself: it expires TOKEN_GRACE_DAYS after the session
 * date. Bookings with an unparseable date fail closed.
 */
function isTokenExpired(bookingDate: unknown): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(bookingDate ?? '').trim());
  if (!m) return true;
  const expiry = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + TOKEN_GRACE_DAYS));
  return todayIst() > expiry.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  
  if (await isRateLimited(clientIp)) {
    logger.warn('MANAGE_BOOKING', 'Rate limit exceeded', { ip: clientIp });
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  // The token travels in a header so it never lands in request logs or
  // analytics as part of a URL.
  const token = request.headers.get('x-booking-token');
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const booking = await firestoreBookingRepository.findByToken(token);
      
    if (!booking) {
      // Never log the raw token: it is a long-lived bearer credential. The
      // fingerprint is enough to correlate repeated abuse of one link.
      logger.warn('MANAGE_BOOKING', 'Invalid token attempt', { tokenFingerprint: fingerprintToken(token), ip: clientIp });
      return NextResponse.json({ error: "Booking not found or link expired." }, { status: 404 });
    }

    if (booking.invalidToken) {
       logger.warn('MANAGE_BOOKING', 'Attempted to use invalidated token', { tokenFingerprint: fingerprintToken(token), bookingId: booking.id });
       return NextResponse.json({ error: "This booking link is no longer valid." }, { status: 400 });
    }

    if (isTokenExpired(booking.date)) {
      logger.warn('MANAGE_BOOKING', 'Expired manage token used', { tokenFingerprint: fingerprintToken(token), bookingId: booking.id });
      return NextResponse.json({ error: "This booking link has expired." }, { status: 410 });
    }

    let therapistName = "Your Therapist";
    try {
      const therapistDoc = await adminDb
        .collection("therapists")
        .doc(booking.therapistId)
        .get();
      if (therapistDoc.exists) {
        therapistName = therapistDoc.data()?.name || therapistName;
      }
    } catch {
      logger.warn('MANAGE_BOOKING', "Failed to fetch therapist info", { therapistId: booking.therapistId });
    }

    logger.info('MANAGE_BOOKING', 'Successfully fetched booking details for token', { bookingId: booking.id });

    return NextResponse.json({
      id: booking.id,
      therapistId: booking.therapistId,
      therapistName,
      date: booking.date,
      time: booking.time,
      status: booking.status,
      name: booking.name,
      sessionMode: booking.sessionMode,
      paymentAmount: booking.paymentAmount,
      paymentCurrency: booking.paymentCurrency,
      razorpayOrderId: booking.razorpayOrderId,
      paymentStatus: booking.paymentStatus
    }, { status: 200 });
  } catch (err) {
    logger.error('MANAGE_BOOKING', 'Internal server error during fetch token', err, { ip: clientIp });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  
  if (await isRateLimited(clientIp)) {
    logger.warn('MANAGE_BOOKING', 'Rate limit exceeded', { ip: clientIp });
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }
  try {
    const bodySchema = z.object({
      token: z.string().min(1),
      newDate: z.string(),
      newTime: z.string(),
    });

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    const { token, newDate, newTime } = parsed.data;

    const booking = await firestoreBookingRepository.findByToken(token);
    if (!booking)
      return NextResponse.json({ error: "Booking not found or link expired." }, { status: 404 });

    if (booking.invalidToken) {
      return NextResponse.json({ error: "This booking link is no longer valid." }, { status: 400 });
    }
    if (isTokenExpired(booking.date)) {
      return NextResponse.json({ error: "This booking link has expired." }, { status: 410 });
    }
    if (READ_ONLY_STATUSES.has(String(booking.status))) {
      return NextResponse.json({ error: "This booking can no longer be changed." }, { status: 409 });
    }

    const bookingId = booking.id;

    const command = new RescheduleBookingCommand(bookingId, newDate, newTime, {
      isTokenFlow: true
    });
    const handler = new RescheduleBookingCommandHandler();
    await handler.execute(command);

    logger.success('MANAGE_BOOKING', 'Booking rescheduled via token successfully', { bookingId, newDate, newTime });
    return NextResponse.json({ success: true, bookingId: bookingId }, { status: 200 });
  } catch (err) {
    logger.error('MANAGE_BOOKING', 'Reschedule failed', err, { ip: clientIp });
    const rawMsg = err instanceof Error ? err.message : String(err);
    if (rawMsg.includes('unavailable') || rawMsg.includes('already booked')) {
      return NextResponse.json({ error: rawMsg }, { status: 409 });
    }
    if (rawMsg.includes('current session time')) {
      return NextResponse.json({ error: rawMsg }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to reschedule booking.' }, { status: 500 });
  }

}
