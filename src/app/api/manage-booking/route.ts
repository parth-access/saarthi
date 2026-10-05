import { NextResponse } from "next/server";
import { getClientIp } from '../_lib/rateLimit';
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin';
import { logger } from "../_lib/logger";
import { firestoreBookingRepository, RescheduleBookingCommand, RescheduleBookingCommandHandler } from "@/domains/booking";

const rateLimits = new Map<string, { count: number; timestamp: number }>();

/** Short, non-reversible correlation marker for a booking token — never log the token itself. */
function fingerprintToken(token: string): string {
  return `${token.slice(0, 6)}…(len ${token.length})`;
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (record && now - record.timestamp < 60000) { 
    if (record.count >= 10) return true;
    record.count++;
  } else {
    rateLimits.set(ip, { count: 1, timestamp: now });
  }
  return false;
}

export async function GET(request: Request) {
  const clientIp = getClientIp(request);
  
  if (isRateLimited(clientIp)) {
    logger.warn('MANAGE_BOOKING', 'Rate limit exceeded', { ip: clientIp });
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
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
  
  if (isRateLimited(clientIp)) {
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
