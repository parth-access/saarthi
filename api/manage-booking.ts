import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { adminDb } from "./_lib/firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ error: "Missing token" });

    try {
      const snapshot = await adminDb
        .collection("bookings")
        .where("bookingToken", "==", token)
        .limit(1)
        .get();
      if (snapshot.empty)
        return res
          .status(404)
          .json({ error: "Booking not found or link expired." });

      const doc = snapshot.docs[0];
      const data = doc.data();

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
        console.warn("Failed to fetch therapist info");
      }

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
      console.error(err);
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
        console.error(
          "Failed to trigger reschedule email from manage-booking",
          err,
        );
      }

      return res.status(200).json({ success: true, bookingId: docRef.id });
    } catch (err: any) {
      console.error(err);
      return res
        .status(500)
        .json({ error: err.message || "Reschedule failed" });
    }
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}
