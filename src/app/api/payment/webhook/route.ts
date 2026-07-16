import { NextResponse } from "next/server";
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../../_lib/logger";
import crypto from "crypto";
import { config } from "@/shared/config";
import { firestoreBookingRepository } from "@/domains/booking";

export async function POST(request: Request) {
  try {
    const webhookSignature = request.headers.get("x-razorpay-signature");
    if (!webhookSignature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const secret = config.razorpay.webhookSecret;
    if (!secret) {
        logger.error("PAYMENT", "Missing webhook secret in env");
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    const payloadText = await request.text();
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payloadText)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      logger.error("PAYMENT", "Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const payload = JSON.parse(payloadText);
    const event = payload.event;

    if (event === "payment.captured") {
      const paymentData = payload.payload.payment.entity;
      const razorpayOrderId = paymentData.order_id;
      const razorpayPaymentId = paymentData.id;

      const booking = await firestoreBookingRepository.findByOrderId(razorpayOrderId);

      if (!booking) {
        logger.error("PAYMENT", "No booking found for order", null, { razorpayOrderId });
        return NextResponse.json({ success: true, note: "Ignored" }, { status: 200 });
      }

      const bookingId = booking.id;

      await adminDb.runTransaction(async (transaction) => {
        const data = await firestoreBookingRepository.findById(bookingId, transaction);
        if (!data) return;
        
        if (data.status === "confirmed" && data.paymentStatus === "paid") {
           return; 
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

        data.confirmPayment(FieldValue.serverTimestamp(), razorpayPaymentId);
        data.updatedAt = FieldValue.serverTimestamp();
        await firestoreBookingRepository.save(data, transaction);

        const auditRef = adminDb.collection("bookings").doc(bookingId).collection("audit_logs").doc();
        transaction.set(auditRef, {
            action: "payment_verified_webhook",
            timestamp: FieldValue.serverTimestamp(),
            details: `Payment verified via webhook reconciliation.`
        });
      });

      logger.success("PAYMENT", "Payment verified via webhook", { bookingId, razorpayPaymentId });
      
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    logger.error("PAYMENT", "Webhook processing failed", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || "Internal Server Error" }, { status: 500 });
  }
}
