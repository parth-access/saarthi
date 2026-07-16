import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin'; 
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../../_lib/logger";
import crypto from "crypto";
import { sendEmailAction } from "../../email/emailSender";
import { config } from "@/shared/config";
import { firestoreBookingRepository } from "@/domains/booking";

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

    const secret = config.razorpay.keySecret || "placeholder";

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
       logger.error("PAYMENT", "Signature mismatch", null, { bookingId });
       return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    
    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) throw new Error("Booking not found");
      
      if (data.status === "confirmed" && data.paymentStatus === "paid") {
         return; 
      }

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

      data.confirmPayment(FieldValue.serverTimestamp(), razorpay_payment_id);
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, transaction);

      const auditRef = adminDb.collection("bookings").doc(bookingId).collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "payment_verified",
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment verified for booking.`
      });

    });

    const updatedBooking = await firestoreBookingRepository.findById(bookingId);
    if (!updatedBooking) throw new Error("Booking not found post-transaction");

    try {
      await sendEmailAction({
          type: 'booking-confirmed',
          bookingId: updatedBooking.id,
          therapistId: updatedBooking.therapistId,
      });
    } catch(err) {
      logger.warn("PAYMENT", "Failed to trigger config email", { error: String(err), bookingId });
    }

    logger.success("PAYMENT", "Payment verified completely", { bookingId, razorpay_payment_id });
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    logger.error("PAYMENT", "Payment verification failed", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || "Internal Server Error" }, { status: 500 });
  }
}
