import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifySession } from "@/lib/auth/verifySession";
import { getResendClient } from "../_lib/resendClient";
import escapeString from "escape-html";
import { checkRateLimit, getClientIp } from "../_lib/rateLimit";
import { logger } from '../_lib/logger';

const ADMIN_EMAIL = 'admin@saarthilife.com';
const FROM_EMAIL = 'Saarthi <noreply@saarthilife.com>';

/** Subject lines are plain text: strip control chars/markup rather than HTML-escape. */
function safeSubject(value: string): string {
  return value.replace(/[\r\n<>]/g, "").slice(0, 120);
}

export async function POST(req: Request) {
  try {
    // This route emails the admin inbox; throttle so an authenticated account
    // cannot flood it.
    if (!checkRateLimit(getClientIp(req), 'reschedule_request', 5, 60_000).success) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    const decodedClaims = await verifySession(req);
    if (!decodedClaims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // `therapistId` in the body is ignored: it used to be stored as sent, so a
    // client could address a request to any therapist, who could then read
    // and act on it (Firestore rules key therapist access on this field).
    const { userId, bookingId, userName, userEmail, reason } = await req.json();

    if (userId !== decodedClaims.uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!userId || typeof bookingId !== 'string' || !bookingId || !userEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // The caller must own the booking (same test as /api/bookings/join-session:
    // uid, or the session's verified email), and the therapist comes from it.
    // Missing and not-yours answer alike, so booking ids cannot be probed.
    const bookingSnap = await adminDb.collection("bookings").doc(bookingId).get();
    const booking = bookingSnap.exists ? bookingSnap.data() : undefined;
    const sessionEmail = decodedClaims.email?.toLowerCase();
    const ownsBooking =
      !!booking &&
      (booking.userId === decodedClaims.uid ||
        (!!sessionEmail && typeof booking.email === 'string' && booking.email.toLowerCase() === sessionEmail));
    if (!ownsBooking) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const therapistId = booking.therapistId;
    if (typeof therapistId !== 'string' || !therapistId) {
      return NextResponse.json({ error: "This booking has no therapist to reschedule with" }, { status: 409 });
    }

    // Create reschedule request in Firestore
    const docRef = await adminDb.collection("reschedule_requests").add({
      userId,
      bookingId,
      therapistId,
      reason: reason || "No reason provided",
      status: "pending",
      createdAt: FieldValue.serverTimestamp()
    });

    // Send email to admin — every client-supplied value is HTML-escaped (this
    // HTML is rendered in the admin's mail client; an escaped value displays
    // as text, a raw one executes as markup).
    await getResendClient().emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      replyTo: 'healwithsaarthi@gmail.com',
      subject: `Reschedule Request: ${safeSubject(String(userName || ''))}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <h2 style="color: #E6A520;">New Reschedule Request</h2>
          <p><strong>${escapeString(String(userName || ''))}</strong> (${escapeString(String(userEmail || ''))}) wants to reschedule booking <strong>${escapeString(String(bookingId || ''))}</strong>.</p>
          <p><strong>Reason:</strong> ${escapeString(String(reason || "No reason provided"))}</p>
          <p>Please log in to the admin dashboard to coordinate further.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    logger.error('RESCHEDULE', 'Error creating reschedule request', error);
    // Opaque to the client; failure details go to logs only.
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
