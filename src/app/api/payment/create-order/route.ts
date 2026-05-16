import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../../_lib/logger";
import Razorpay from "razorpay";

export async function POST(request: Request) {
  try {
    const payloadSchema = z.object({
      bookingId: z.string().min(1)
    });

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { bookingId } = parsed.data;

    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    
    await adminDb.runTransaction(async (transaction) => {
      const bookingDoc = await transaction.get(bookingRef);
      if (!bookingDoc.exists) {
        throw new Error("Booking not found");
      }
      
      const data = bookingDoc.data()!;
      if (data.status !== "pending_approval" && data.status !== "pending") {
         throw new Error("Booking is not in pending approval state");
      }

      let price = 1500;
      if (data.sessionMode === 'in_person') price = 2000;
      const amount = price;
      const currency = "INR";

      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
        key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder"
      });

      const order = await rzp.orders.create({
        amount: amount * 100,
        currency,
        receipt: `receipt_${bookingId}`,
        notes: {
           bookingId,
           therapistId: data.therapistId
        }
      });

      const auditRef = bookingRef.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "awaiting_payment",
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment order generated`
      });

      transaction.update(bookingRef, {
        status: "awaiting_payment",
        paymentStatus: "pending",
        paymentAmount: amount,
        paymentCurrency: currency,
        razorpayOrderId: order.id,
        updatedAt: FieldValue.serverTimestamp()
      });
      
    });

    const updatedBooking = await bookingRef.get();
    const data = updatedBooking.data()!;

    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host');
    const apiUrl = `${protocol}://${host}/api/email`;

    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: 'booking-payment-link',
            bookingId: updatedBooking.id,
            therapistId: data.therapistId,
        })
      });
    } catch(err) {
      logger.warn("PAYMENT", "Failed to trigger payment email", { error: String(err), bookingId });
    }

    logger.success("PAYMENT", "Created Razorpay order and payment link successfully", { bookingId });
    return NextResponse.json({ success: true, bookingId }, { status: 200 });

  } catch (error: any) {
    logger.error("PAYMENT", "Failed to create payment order", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
