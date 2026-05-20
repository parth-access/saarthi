import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireTherapist } from '../../../../lib/auth/requireRole';

const schema = z.object({
  bookingId: z.string(),
  status: z.string()
});

export async function POST(req: Request) {
  try {
    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    
    const { bookingId, status } = parsed.data;
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
      
      t.update(ref, {
        status,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (status === 'cancelled' || status === 'rejected') {
         const slotId = `${data.therapistId}_${data.date}_${data.time}`.replace(/\//g, '-');
         const slotRef = adminDb.collection('locked_slots').doc(slotId);
         t.delete(slotRef);
      }

      const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      t.set(auditRef, {
        action: 'status_updated',
        status,
        timestamp: FieldValue.serverTimestamp(),
        details: `Booking status changed to ${status}`,
        userId: session.uid
      });

      return { bookingData: data, therapistId: data.therapistId };
    });

    if (status === 'confirmed') {
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
                type: 'booking-confirmed', 
                bookingId, 
                therapistId,
                bookingDetails: {
                   name: bookingData.name,
                   email: bookingData.email,
                   phone: bookingData.phone,
                   date: bookingData.date,
                   time: bookingData.time,
                }
              })
            });
          } catch(err) {
            console.error('Failed to send confirmation email:', err);
          }
       } catch {}
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes("not found") ? "Booking not found" : 
                (error instanceof Error ? error.message : String(error)).includes("Unauthorized") ? "Unauthorized" : "Failed to update status";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
