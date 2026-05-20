import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireTherapist } from '../../../../lib/auth/requireRole';

const schema = z.object({
  bookingId: z.string(),
  newDate: z.string(),
  newTime: z.string()
});

export async function POST(req: Request) {
  try {
    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    
    const { bookingId, newDate, newTime } = parsed.data;

    let utcDateTime = '';
    try {
       const localString = `${newDate}T${newTime}`;
       const dt = new Date(localString);
       utcDateTime = isNaN(dt.getTime()) ? '' : dt.toISOString();
    } catch {}

    const ref = adminDb.collection('bookings').doc(bookingId);

    let therapistAuthId = '';
    if (session.role === 'therapist') {
       therapistAuthId = session.uid;
    }

    const { bookingData, therapistId } = await adminDb.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) throw new Error("Booking not found");
      const data = doc.data()!;
      
      if (therapistAuthId) {
         const therapistDoc = await t.get(adminDb.collection('therapists').doc(data.therapistId));
         if (!therapistDoc.exists || therapistDoc.data()?.authId !== therapistAuthId) {
            throw new Error("Unauthorized to modify this booking");
         }
      }

      if (data.status === 'cancelled' || data.status === 'rejected') {
        throw new Error("Cannot reschedule a cancelled or rejected booking.");
      }

      const oldSlotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
      const oldSlotRef = adminDb.collection('locked_slots').doc(oldSlotId);
      
      const newSlotId = `${data.therapistId}_${newDate}_${newTime}`.replace(/\//g, '-');
      const newSlotRef = adminDb.collection('locked_slots').doc(newSlotId);

      const newSlotDoc = await t.get(newSlotRef);
      if (newSlotDoc.exists) {
        const newSlotData = newSlotDoc.data()!;
        if (newSlotData?.expiresAt && newSlotData.expiresAt.toDate() < new Date()) {
          t.delete(newSlotRef);
        } else if ('bookingId' in newSlotData) {
          throw new Error("This new slot is already booked.");
        } else {
          throw new Error("This new slot is unavailable.");
        }
      }

      t.delete(oldSlotRef);
      t.set(newSlotRef, {
        therapistId: data.therapistId,
        date: newDate,
        time: newTime,
        bookingId: bookingId,
        createdAt: FieldValue.serverTimestamp()
      });

      t.update(ref, {
        originalDate: data.date,
        originalTime: data.time,
        date: newDate,
        time: newTime,
        utcDateTime,
        updatedAt: FieldValue.serverTimestamp(),
        rescheduledAt: FieldValue.serverTimestamp(),
      });

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'rescheduled',
        timestamp: FieldValue.serverTimestamp(),
        details: `Booking rescheduled from ${data.date} ${data.time} to ${newDate} ${newTime}`,
        userId: session.uid
      });

      return { bookingData: data, therapistId: data.therapistId };
    });

    try {
        const protocol = req.headers.get('x-forwarded-proto') || 'http';
        const host = req.headers.get('host');
        const origin = `${protocol}://${host}`;
        
        try {
          await fetch(`${origin}/api/email`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization') || '' 
            },
            body: JSON.stringify({ 
              type: 'booking-rescheduled', 
              bookingId, 
              therapistId,
              bookingDetails: {
                  name: bookingData.name,
                  email: bookingData.email,
                  phone: bookingData.phone,
                  date: newDate,
                  time: newTime,
                  originalDate: bookingData.date,
                  originalTime: bookingData.time,
                  sessionMode: bookingData.sessionMode,
                  bookingToken: bookingData.bookingToken,
              }
            })
          });
        } catch(err) {
          console.error('Failed to send reschedule email:', err);
        }
    } catch {}

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes("unavailable") ? "This new slot is unavailable." :
                (error instanceof Error ? error.message : String(error)).includes("booked") ? "This new slot is already booked." :
                (error instanceof Error ? error.message : String(error)).includes("Unauthorized") ? "Unauthorized" :
                "Failed to reschedule booking";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
