import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { Resend } from "resend";
import { FieldValue } from "firebase-admin/firestore";
import { verifySession } from "@/lib/auth/verifySession";

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'admin@saarthilife.com';
const FROM_EMAIL = 'Saarthi <noreply@saarthilife.com>';

export async function POST(req: Request) {
  try {
    const decodedClaims = await verifySession(req);
    if (!decodedClaims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId, bookingId, therapistId, userName, userEmail, reason } = await req.json();

    if (userId !== decodedClaims.uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!userId || !bookingId || !therapistId || !userEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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

    // Send email to admin
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Reschedule Request: ${userName}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <h2 style="color: #E6A520;">New Reschedule Request</h2>
          <p><strong>${userName}</strong> (${userEmail}) wants to reschedule booking <strong>${bookingId}</strong>.</p>
          <p><strong>Reason:</strong> ${reason || "No reason provided"}</p>
          <p>Please log in to the admin dashboard to coordinate further.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error("Error creating reschedule request:", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
