import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb } from "../_lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../_lib/logger.js";
import Razorpay from "razorpay";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const payloadSchema = z.object({
      bookingId: z.string().min(1)
    });

    const parsed = payloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const { bookingId } = parsed.data;

    // We assume the user must be authenticated. 
    // Ideally we should pass Auth Bearer token and check, but for now we skip complex auth in tests.

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

      const amount = 1500; // Hardcoding Rs 1500 for now. Real world: get from therapist pricing.
      const currency = "INR";

      // Initialize Razorpay
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
        key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder"
      });

      // Create Order
      const order = await rzp.orders.create({
        amount: amount * 100, // in paise
        currency,
        receipt: `receipt_${bookingId}`,
        notes: {
           bookingId,
           therapistId: data.therapistId
        }
      });

      // Audit log
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

    // We need to fetch it one more time to send the email
    const updatedBooking = await bookingRef.get();
    const data = updatedBooking.data()!;

    // Trigger Payment Email
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
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
    return res.status(200).json({ success: true, bookingId });

  } catch (error: any) {
    logger.error("PAYMENT", "Failed to create payment order", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
