import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAuthenticated } from '../../../../lib/auth/requireRole';

const schema = z.object({
  therapistId: z.string(),
  date: z.string(),
  time: z.string()
});

export async function POST(req: Request) {
  try {
    const authResult = await requireAuthenticated(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }
    const { therapistId, date, time } = parsed.data;

    const therapistDoc = await adminDb.collection('therapists').doc(therapistId).get();
    if (!therapistDoc.exists) {
       return NextResponse.json({ error: 'Therapist not found' }, { status: 404 });
    }
    
    const slotId = `${therapistId}_${date}_${time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    const result = await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const data = doc.data() || {};
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
          t.delete(slotRef); 
        } else if (data.bookingId) {
          throw new Error("Slot unavailable");
        } else if (data.userId === session.uid) {
           // lock refresh
        } else {
          throw new Error("Slot unavailable");
        }
      }
      
      const lockId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60000); // 5 minutes
      
      t.set(slotRef, {
        lockId,
        therapistId,
        date,
        time,
        userId: session.uid,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt)
      });
      return { lockId };
    });

    return NextResponse.json({ success: true, lockId: result.lockId });
  } catch (error) {
    const msg = (error instanceof Error ? error.message : String(error)).includes("unavailable") ? "This slot is currently unavailable." : "An unexpected error occurred.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
