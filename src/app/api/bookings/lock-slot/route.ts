import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { verifySession } from '../../../../lib/auth/verifySession';
import crypto from 'crypto';

const schema = z.object({
  therapistId: z.string(),
  date: z.string(),
  time: z.string()
});

export async function POST(req: Request) {
  let therapistId = '';
  let date = '';
  let time = '';
  let userId = '';
  let slotId = '';
  try {
    const session = await verifySession(req);
    const guestId = `guest_${crypto.randomUUID()}`;
    userId = session?.uid || guestId;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.warn(`[DEBUG] lock-slot invalid input: ${JSON.stringify(parsed.error.format())}`);
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }
    therapistId = parsed.data.therapistId;
    date = parsed.data.date;
    time = parsed.data.time;

    console.log(`[DEBUG] lock-slot request: therapistId=${therapistId}, date=${date}, time=${time}, userId=${userId}`);

    const therapistDoc = await adminDb.collection('therapists').doc(therapistId).get();
    if (!therapistDoc.exists) {
       console.warn(`[DEBUG] lock-slot therapist not found: ${therapistId}`);
       return NextResponse.json({ error: 'Therapist not found' }, { status: 404 });
    }
    
    slotId = `${therapistId}_${date}_${time}`.replace(/\//g, '-');
    const slotRef = adminDb.collection('locked_slots').doc(slotId);

    const result = await adminDb.runTransaction(async (t) => {
      const doc = await t.get(slotRef);
      if (doc.exists) {
        const data = doc.data() || {};
        let isExpired = false;
        
        if (data.expiresAt) {
          const expiresDate = typeof data.expiresAt.toDate === 'function' ? data.expiresAt.toDate() : new Date(data.expiresAt);
          if (expiresDate < new Date()) {
            isExpired = true;
          }
        }

        if (isExpired) {
          t.delete(slotRef); 
        } else if (data.bookingId) {
          throw new Error("Slot unavailable");
        } else if (data.userId === userId) {
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
        userId,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt)
      });
      return { lockId };
    });

    console.log(`[DEBUG] lock-slot success: slotId=${slotId}, lockId=${result.lockId}, userId=${userId}`);
    return NextResponse.json({ success: true, lockId: result.lockId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DEBUG] lock-slot failure: slotId=${slotId}, userId=${userId}, error=${errMsg}`);
    const msg = errMsg.includes("unavailable") ? "This slot is currently unavailable." : "An unexpected error occurred.";
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
