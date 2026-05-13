import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb } from "./_lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "./_lib/logger.js";

// In-memory rate limiting (basic protection since serverless wipes this constantly, but helps burst)
const rateLimits = new Map<string, { count: number; timestamp: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (record && now - record.timestamp < 60000) { // 1 min window
    if (record.count >= 10) return true;
    record.count++;
  } else {
    rateLimits.set(ip, { count: 1, timestamp: now });
  }
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const clientIp = req.headers['x-forwarded-for']?.toString() || 'unknown';
  
  if (isRateLimited(clientIp)) {
    logger.warn('MANAGE_BOOKING', 'Rate limit exceeded', { ip: clientIp });
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  if (req.method === "GET") {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ error: "Missing token" });

    try {
      const snapshot = await adminDb
        .collection("bookings")
        .where("bookingToken", "==", token)
        .limit(1)
        .get();
        
      if (snapshot.empty) {
        logger.warn('MANAGE_BOOKING', 'Invalid token attempt', { token, ip: clientIp });
        return res.status(404).json({ error: "Booking not found or link expired." });
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      if (data.invalidToken) {
         logger.warn('MANAGE_BOOKING', 'Attempted to use invalidated token', { token, bookingId: doc.id });
         return res.status(400).json({ error: "This booking link is no longer valid." });
      }

      let therapistName = "Your Therapist";
      try {
        const therapistDoc = await adminDb
          .collection("therapists")
          .doc(data.therapistId)
          .get();
        if (therapistDoc.exists) {
          therapistName = therapistDoc.data()?.name || therapistName;
        }
      } catch (err) {
        logger.warn('MANAGE_BOOKING', "Failed to fetch therapist info", { therapistId: data.therapistId });
      }

      logger.info('MANAGE_BOOKING', 'Successfully fetched booking details for token', { bookingId: doc.id });


      // Return safe patient-facing data
      return res.status(200).json({
        id: doc.id,
        therapistId: data.therapistId,
        therapistName,
        date: data.date,
        time: data.time,
        status: data.status,
        name: data.name,
        sessionMode: data.sessionMode,
      });
    } catch (err) {
      logger.error('MANAGE_BOOKING', 'Internal server error during fetch token', err, { ip: clientIp });
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  if (req.method === "POST") {
    // Reschedule flow
    try {
      const bodySchema = z.object({
        token: z.string().min(1),
        newDate: z.string(),
        newTime: z.string(),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Invalid payload" });

      const { token, newDate, newTime } = parsed.data;

      const snapshot = await adminDb
        .collection("bookings")
        .where("bookingToken", "==", token)
        .limit(1)
        .get();
      if (snapshot.empty)
        return res
          .status(404)
          .json({ error: "Booking not found or link expired." });

      const docRef = snapshot.docs[0].ref;
      const data = snapshot.docs[0].data();

      if (data.status === "cancelled" || data.status === "rejected") {
        return res
          .status(400)
          .json({
            error: "Cannot reschedule a cancelled or rejected booking.",
          });
      }

      await adminDb.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        if (!docSnap.exists) throw new Error("Booking not found");

        const latestData = docSnap.data()!;

        const oldSlotId =
          `${latestData.therapistId}_${latestData.date}_${latestData.time}`.replace(
            /\//g,
            "-",
          );
        const oldSlotRef = adminDb.collection("locked_slots").doc(oldSlotId);

        const newSlotId =
          `${latestData.therapistId}_${newDate}_${newTime}`.replace(/\//g, "-");
        const newSlotRef = adminDb.collection("locked_slots").doc(newSlotId);

        const newSlotSnap = await transaction.get(newSlotRef);
        if (newSlotSnap.exists) {
          throw new Error("This new slot is no longer available.");
        }

        // Release old
        transaction.delete(oldSlotRef);

        // Lock new
        transaction.set(newSlotRef, {
          bookingId: docSnap.id,
          createdAt: FieldValue.serverTimestamp(),
        });

        // Update booking
        transaction.update(docRef, {
          originalDate: latestData.date,
          originalTime: latestData.time,
          date: newDate,
          time: newTime,
          updatedAt: FieldValue.serverTimestamp(),
          rescheduledAt: FieldValue.serverTimestamp(),
        });

        // Audit log
        const auditRef = docRef.collection("audit_logs").doc();
        transaction.set(auditRef, {
          action: "rescheduled",
          timestamp: FieldValue.serverTimestamp(),
          details: `Booking rescheduled via manage link from ${latestData.date} ${latestData.time} to ${newDate} ${newTime}`,
        });
      });

      // Fire email
      try {
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const host = req.headers.host;
        const apiUrl = `${protocol}://${host}/api/email`;

        await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "booking-rescheduled",
            bookingId: docRef.id,
            therapistId: data.therapistId,
          }),
        });
      } catch (err) {
        logger.warn("MANAGE_BOOKING", "Failed to trigger reschedule email from manage-booking", { error: String(err), bookingId: docRef.id });
      }

      logger.success('MANAGE_BOOKING', 'Booking rescheduled via token successfully', { bookingId: docRef.id, newDate, newTime });
      return res.status(200).json({ success: true, bookingId: docRef.id });
    } catch (err: any) {
      logger.error('MANAGE_BOOKING', 'Reschedule failed', err, { ip: clientIp });
      return res
        .status(500)
        .json({ error: err.message || "Reschedule failed" });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
