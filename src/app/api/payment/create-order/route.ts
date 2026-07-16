import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../../_lib/logger";
import Razorpay from "razorpay";
import { sendEmailAction } from "../../email/emailSender";
import { config } from "@/shared/config";
import { firestoreBookingRepository } from "@/domains/booking";

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
    
    await adminDb.runTransaction(async (transaction) => {
      const data = await firestoreBookingRepository.findById(bookingId, transaction);
      if (!data) {
        throw new Error("Booking not found");
      }
      
      if (data.status !== "pending_approval" && data.status !== "pending" && data.status !== "awaiting_payment") {
         throw new Error("Booking is not in a valid state to create a payment order");
      }

      let price = 1500;
      if (data.sessionMode === 'in_person') price = 2000;
      const amount = price;
      const currency = "INR";

      const rzp = new Razorpay({
        key_id: config.razorpay.keyId || "rzp_test_placeholder",
        key_secret: config.razorpay.keySecret || "placeholder"
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

      const auditRef = adminDb.collection("bookings").doc(bookingId).collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "awaiting_payment",
        timestamp: FieldValue.serverTimestamp(),
        details: `Payment order generated`
      });

      data.awaitPayment();
      data.paymentStatus = "pending";
      data.paymentAmount = amount;
      data.paymentCurrency = currency;
      data.razorpayOrderId = order.id;
      data.updatedAt = FieldValue.serverTimestamp();
      await firestoreBookingRepository.save(data, transaction);
      
    });

    const updatedBooking = await firestoreBookingRepository.findById(bookingId);
    if (!updatedBooking) throw new Error("Booking not found post-transaction");

    try {
      await sendEmailAction({
          type: 'booking-payment-link',
          bookingId: updatedBooking.id,
          therapistId: updatedBooking.therapistId,
      });
    } catch(err) {
      logger.warn("PAYMENT", "Failed to trigger payment email", { error: String(err), bookingId });
    }

    logger.success("PAYMENT", "Created Razorpay order and payment link successfully", { bookingId });
    return NextResponse.json({ success: true, bookingId }, { status: 200 });

  } catch (error) {
    logger.error("PAYMENT", "Failed to create payment order", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || "Internal Server Error" }, { status: 500 });
  }
}
