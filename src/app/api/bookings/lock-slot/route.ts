import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { z } from 'zod';
import { verifySession } from '../../../../lib/auth/verifySession';
import crypto from 'crypto';
import { LockSlotCommand, LockSlotCommandHandler, SlotReservationService } from '@/domains/booking';

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
    
    slotId = SlotReservationService.getSlotId(therapistId, date, time);

    const command = new LockSlotCommand(therapistId, date, time, userId);
    const handler = new LockSlotCommandHandler();
    const result = await handler.execute(command);

    if (!result.success) {
      console.warn(`[DEBUG] lock-slot failed: slotId=${slotId}, userId=${userId}, error=${result.error}`);
      const isReserved = result.error?.includes('reserved');
      return NextResponse.json(
        { success: false, error: result.error || 'Slot is currently unavailable.' },
        { status: isReserved ? 409 : 400 }
      );
    }

    console.log(`[DEBUG] lock-slot success: slotId=${slotId}, lockId=${result.lockId}, userId=${userId}`);
    return NextResponse.json({ success: true, lockId: result.lockId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DEBUG] lock-slot failure: slotId=${slotId}, userId=${userId}, error=${errMsg}`);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
