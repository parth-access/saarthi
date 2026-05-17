import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../_lib/logger";

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
    } catch (err) {
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

    const docRef = snapshot.docs[0].ref;
    const data = snapshot.docs[0].data();

    if (data.status === "cancelled" || data.status === "rejected") {
      return NextResponse.json({
          error: "Cannot reschedule a cancelled or rejected booking.",
        }, { status: 400 });
    }

    await adminDb.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) throw new Error("Booking not found");

      const latestData = docSnap.data()!;

      const oldSlotId =
        `${latestData.therapistId}_${latestData.date}_${latestData.time}`.replace(
          /\//g,
          "-",
        );
      const oldSlotRef = adminDb.collection("locked_slots").doc(oldSlotId);

      const newSlotId =
        `${latestData.therapistId}_${newDate}_${newTime}`.replace(/\//g, "-");
      const newSlotRef = adminDb.collection("locked_slots").doc(newSlotId);

      const newSlotSnap = await transaction.get(newSlotRef);
      if (newSlotSnap.exists) {
        const slotData = newSlotSnap.data();
        if (slotData) {
          const now = Date.now();
          const isExpired = (slotData.expiresAt && typeof slotData.expiresAt.toMillis === 'function' && now >= slotData.expiresAt.toMillis()) || (slotData.expiresAt && typeof slotData.expiresAt === 'number' && now >= slotData.expiresAt);
          if (!isExpired) {
            throw new Error("This new slot is no longer available.");
          }
        }
      }

      transaction.delete(oldSlotRef);

      transaction.set(newSlotRef, {
        bookingId: docSnap.id,
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.update(docRef, {
        originalDate: latestData.date,
        originalTime: latestData.time,
        date: newDate,
        time: newTime,
        updatedAt: FieldValue.serverTimestamp(),
        rescheduledAt: FieldValue.serverTimestamp(),
      });

      const auditRef = docRef.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "rescheduled",
        timestamp: FieldValue.serverTimestamp(),
        details: `Booking rescheduled via manage link from ${latestData.date} ${latestData.time} to ${newDate} ${newTime}`,
      });
    });

    try {
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const host = request.headers.get("host");
      const apiUrl = `${protocol}://${host}/api/email`;

      await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "booking-rescheduled",
          bookingId: docRef.id,
          therapistId: data.therapistId,
        }),
      });
    } catch (err) {
      logger.warn("MANAGE_BOOKING", "Failed to trigger reschedule email from manage-booking", { error: String(err), bookingId: docRef.id });
    }

    logger.success('MANAGE_BOOKING', 'Booking rescheduled via token successfully', { bookingId: docRef.id, newDate, newTime });
    return NextResponse.json({ success: true, bookingId: docRef.id }, { status: 200 });
  } catch (err: any) {
    logger.error('MANAGE_BOOKING', 'Reschedule failed', err, { ip: clientIp });
    return NextResponse.json({ error: err.message || "Reschedule failed" }, { status: 500 });
  }
}
