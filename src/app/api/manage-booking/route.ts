import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin';
import { logger } from "../_lib/logger";
import { BookingService } from "@/server/services/BookingService";
import { sendEmailAction } from "../email/emailSender";

const rateLimits = new Map<string, { count: number; timestamp: number }>();

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
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  
  if (isRateLimited(clientIp)) {
    logger.warn('MANAGE_BOOKING', 'Rate limit exceeded', { ip: clientIp });
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  try {
    const snapshot = await adminDb
      .collection("bookings")
      .where("bookingToken", "==", token)
      .limit(1)
      .get();
      
    if (snapshot.empty) {
      logger.warn('MANAGE_BOOKING', 'Invalid token attempt', { token, ip: clientIp });
      return NextResponse.json({ error: "Booking not found or link expired." }, { status: 404 });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    if (data.invalidToken) {
       logger.warn('MANAGE_BOOKING', 'Attempted to use invalidated token', { token, bookingId: doc.id });
       return NextResponse.json({ error: "This booking link is no longer valid." }, { status: 400 });
    }

    let therapistName = "Your Therapist";
    try {
      const therapistDoc = await adminDb
        .collection("therapists")
        .doc(data.therapistId)
        .get();
      if (therapistDoc.exists) {
        therapistName = therapistDoc.data()?.name || therapistName;
      }
    } catch {
      logger.warn('MANAGE_BOOKING', "Failed to fetch therapist info", { therapistId: data.therapistId });
    }

    logger.info('MANAGE_BOOKING', 'Successfully fetched booking details for token', { bookingId: doc.id });

    return NextResponse.json({
      id: doc.id,
      therapistId: data.therapistId,
      therapistName,
      date: data.date,
      time: data.time,
      status: data.status,
      name: data.name,
      sessionMode: data.sessionMode,
      paymentAmount: data.paymentAmount,
      paymentCurrency: data.paymentCurrency,
      razorpayOrderId: data.razorpayOrderId,
      paymentStatus: data.paymentStatus
    }, { status: 200 });
  } catch (err) {
    logger.error('MANAGE_BOOKING', 'Internal server error during fetch token', err, { ip: clientIp });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  
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

    const snapshot = await adminDb
      .collection("bookings")
      .where("bookingToken", "==", token)
      .limit(1)
      .get();
    if (snapshot.empty)
      return NextResponse.json({ error: "Booking not found or link expired." }, { status: 404 });

    const bookingId = snapshot.docs[0].id;
    const data = snapshot.docs[0].data();

    await BookingService.rescheduleBooking(bookingId, newDate, newTime, {
      isTokenFlow: true
    });

    try {
      await sendEmailAction({
        type: "booking-rescheduled",
        bookingId: bookingId,
        therapistId: data.therapistId,
      });
    } catch (err) {
      logger.warn("MANAGE_BOOKING", "Failed to trigger reschedule email from manage-booking", { error: String(err), bookingId });
    }

    logger.success('MANAGE_BOOKING', 'Booking rescheduled via token successfully', { bookingId, newDate, newTime });
    return NextResponse.json({ success: true, bookingId: bookingId }, { status: 200 });
  } catch (err) {
    logger.error('MANAGE_BOOKING', 'Reschedule failed', err, { ip: clientIp });
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) || "Reschedule failed" }, { status: 500 });
  }
}
