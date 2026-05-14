import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb } from "../_lib/firebaseAdmin.js"; // adjust path
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../_lib/logger.js";
import crypto from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const payloadSchema = z.object({
      bookingId: z.string().min(1),
      razorpay_payment_id: z.string().min(1),
      razorpay_order_id: z.string().min(1),
      razorpay_signature: z.string().min(1)
    });

    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const { bookingId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = parsed.data;

    const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder";

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
       logger.error("PAYMENT", "Signature mismatch", null, { bookingId });
       return res.status(400).json({ error: "Invalid signature" });
    }

    const bookingRef = adminDb.collection("bookings").doc(bookingId);
    
    await adminDb.runTransaction(async (transaction) => {
      const bookingDoc = await transaction.get(bookingRef);
      if (!bookingDoc.exists) throw new Error("Booking not found");
      
      const data = bookingDoc.data()!;
      if (data.status === "confirmed" && data.paymentStatus === "paid") {
         return; // Already processed
      }

      // Record payment document
      const paymentRef = adminDb.collection("payments").doc(razorpay_payment_id);
      transaction.set(paymentRef, {
        bookingId,
        therapistId: data.therapistId,
        patientEmail: data.email,
        amount: data.paymentAmount,
        currency: data.paymentCurrency,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "success",
        createdAt: FieldValue.serverTimestamp(),
        verifiedAt: FieldValue.serverTimestamp()
      });

      // Update booking
      transaction.update(bookingRef, {
        status: "confirmed",
        paymentStatus: "paid",
        razorpayPaymentId: razorpay_payment_id,
        paymentVerifiedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Audit log
      const auditRef = bookingRef.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "payment_verified",
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment verified for booking.`
      });

    });

    const updatedBooking = await bookingRef.get();
    const data = updatedBooking.data()!;

    // Send Confirmation Email
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
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
    return res.status(200).json({ success: true });

  } catch (error: any) {
    logger.error("PAYMENT", "Payment verification failed", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
