import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "../_lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../_lib/logger.js";
import crypto from "crypto";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const webhookSignature = req.headers["x-razorpay-signature"] as string;
    if (!webhookSignature) {
      return res.status(400).json({ error: "Missing signature" });
    }

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        logger.error("PAYMENT", "Missing webhook secret in env");
        return res.status(500).json({ error: "Internal Server Error" });
    }

    const bodyText = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(bodyText)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      logger.error("PAYMENT", "Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const { event, payload } = req.body;

    if (event === "payment.captured") {
      const paymentData = payload.payment.entity;
      const razorpayOrderId = paymentData.order_id;
      const razorpayPaymentId = paymentData.id;

      // Find booking by razorpayOrderId
      const querySnap = await adminDb.collection("bookings")
        .where("razorpayOrderId", "==", razorpayOrderId)
        .limit(1)
        .get();

      if (querySnap.empty) {
        logger.error("PAYMENT", "No booking found for order", null, { razorpayOrderId });
        return res.status(200).json({ success: true, note: "Ignored" });
      }

      const bookingRef = querySnap.docs[0].ref;
      const bookingId = bookingRef.id;

      await adminDb.runTransaction(async (transaction) => {
        const bookingDoc = await transaction.get(bookingRef);
        if (!bookingDoc.exists) return;
        
        const data = bookingDoc.data()!;
        if (data.status === "confirmed" && data.paymentStatus === "paid") {
           return; // Already processed by frontend verification 
        }

        const paymentRef = adminDb.collection("payments").doc(razorpayPaymentId);
        transaction.set(paymentRef, {
            bookingId,
            amount: paymentData.amount / 100,
            currency: paymentData.currency,
            razorpayOrderId,
            razorpayPaymentId,
            status: "success",
            createdAt: FieldValue.serverTimestamp(),
            verifiedAt: FieldValue.serverTimestamp(),
            source: "webhook"
        });

        transaction.update(bookingRef, {
            status: "confirmed",
            paymentStatus: "paid",
            razorpayPaymentId,
            paymentVerifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        const auditRef = bookingRef.collection("audit_logs").doc();
        transaction.set(auditRef, {
            action: "payment_verified_webhook",
            timestamp: FieldValue.serverTimestamp(),
            details: `Payment verified via webhook reconciliation.`
        });
      });

      logger.success("PAYMENT", "Payment verified via webhook", { bookingId, razorpayPaymentId });
      
      // Could trigger email here if via webhook reconciliation, assuming frontend failed.
      // But for simplicity, we let it be.
    }

    return res.status(200).json({ success: true });

  } catch (error: any) {
    logger.error("PAYMENT", "Webhook processing failed", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
