import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAuthenticated } from '../../../../lib/auth/requireRole';

const bookingSchema = z.object({
  lockId: z.string().optional(),
  therapistId: z.string().min(1, "Therapist ID is required"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  date: z.string(),
  time: z.string(),
  sessionType: z.string().optional(),
  sessionMode: z.string().optional(),
  message: z.string().optional(),
  gender: z.string().optional(),
  age: z.union([z.string(), z.number()]).optional(),
});

export async function POST(req: Request) {
  try {
    const authResult = await requireAuthenticated(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = bookingSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const { lockId, ...bookingData } = parsed.data;
    
    const email = session.email;
    if (!email) {
      return NextResponse.json({ error: 'Verified email is required to book.' }, { status: 400 });
    }

    const therapistDoc = await adminDb.collection('therapists').doc(bookingData.therapistId).get();
    if (!therapistDoc.exists) {
       return NextResponse.json({ error: 'Therapist not found' }, { status: 404 });
    }

    let utcDateTime = '';
    try {
       const localString = `${bookingData.date}T${bookingData.time}`;
       const dt = new Date(localString);
       utcDateTime = isNaN(dt.getTime()) ? '' : dt.toISOString();
    } catch {}

    const slotId = `${bookingData.therapistId}_${bookingData.date}_${bookingData.time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);
    const newBookingRef = adminDb.collection('bookings').doc();
    const bookingToken = crypto.randomUUID() + crypto.randomUUID();

    await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const data = doc.data();
        if (data?.expiresAt && data.expiresAt.toDate() < new Date()) {
          t.delete(slotRef);
        } else if (data?.bookingId) {
          throw new Error("This slot is already booked.");
        } else if (data?.lockId && data.lockId !== lockId) {
          throw new Error("This slot is currently locked by another user.");
        }
      }
      
      t.set(slotRef, {
        therapistId: bookingData.therapistId,
        date: bookingData.date,
        time: bookingData.time,
        bookingId: newBookingRef.id,
        createdAt: FieldValue.serverTimestamp()
      });

      t.set(newBookingRef, {
        ...bookingData,
        email, 
        userId: session.uid,
        utcDateTime,
        status: 'pending_approval',
        paymentStatus: 'unpaid', // We aren't doing the checkout here directly, yet.
        bookingToken,
        sessionMode: bookingData.sessionMode || 'Online',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      const auditRef = adminDb.collection('bookings').doc(newBookingRef.id).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'created',
        timestamp: FieldValue.serverTimestamp(),
        details: 'Booking requested by patient',
        userId: session.uid
      });
    });

    try {
      const payload = { 
        type: 'booking-received', 
        bookingId: newBookingRef.id, 
        therapistId: bookingData.therapistId,
        bookingDetails: {
           name: bookingData.name,
           email,
           phone: bookingData.phone,
           date: bookingData.date,
           time: bookingData.time,
        }
      };
      
      const protocol = req.headers.get('x-forwarded-proto') || 'http';
      const host = req.headers.get('host');
      const origin = `${protocol}://${host}`;
      
      try {
        await fetch(`${origin}/api/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Failed to send email:', err);
      }
    } catch {}

    return NextResponse.json({ success: true, bookingId: newBookingRef.id });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes("booked") || (error instanceof Error ? error.message : String(error)).includes("locked") 
                ? (error instanceof Error ? error.message : String(error)) : "Failed to create booking";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
