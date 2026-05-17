import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin'; 
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../../_lib/logger";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const payloadSchema = z.object({
      bookingId: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_order_id: z.string().min(1),
      razorpay_signature: z.string().min(1)
    });

    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { bookingId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data;

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      logger.error("PAYMENT", "RAZORPAY_KEY_SECRET missing for signature verification");
      return NextResponse.json({ error: "Payment configuration is incomplete" }, { status: 500 });
    }

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
       logger.error("PAYMENT", "Signature mismatch", null, { bookingId });
       return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    
    await adminDb.runTransaction(async (transaction) => {
      const bookingDoc = await transaction.get(bookingRef);
      if (!bookingDoc.exists) throw new Error("Booking not found");
      
      const data = bookingDoc.data()!;
      if (data.status === "confirmed" && data.paymentStatus === "paid") {
         return; 
      }

      const paymentRef = adminDb.collection("payments").doc(razorpay_payment_id);
      transaction.set(paymentRef, {
        bookingId,
        userId: data.userId || null,
        therapistId: data.therapistId,
        patientEmail: data.email,
        amount: data.paymentAmount,
        currency: data.paymentCurrency,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "success",
        paymentStatus: "paid",
        invoiceNumber: `INV-${bookingId.slice(0, 8).toUpperCase()}`,
        createdAt: FieldValue.serverTimestamp(),
        verifiedAt: FieldValue.serverTimestamp()
      });

      transaction.update(bookingRef, {
        status: "confirmed",
        paymentStatus: "paid",
        razorpayPaymentId: razorpay_payment_id,
        paymentVerifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      const auditRef = bookingRef.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "payment_verified",
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment verified for booking.`
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
            type: 'booking-confirmed',
            bookingId: updatedBooking.id,
            therapistId: data.therapistId,
        })
      });
    } catch(err) {
      logger.warn("PAYMENT", "Failed to trigger config email", { error: String(err), bookingId });
    }

    logger.success("PAYMENT", "Payment verified completely", { bookingId, razorpay_payment_id });
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    logger.error("PAYMENT", "Payment verification failed", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
