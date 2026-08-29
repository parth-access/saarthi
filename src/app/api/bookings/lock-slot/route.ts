import { NextResponse } from 'next/server';
import { adminDb } from '../../../../lib/firebase/admin';
import { lockSlotSchema } from '@/server/validators/bookingValidators';
import { verifySession } from '../../../../lib/auth/verifySession';
import crypto from 'crypto';
import { LockSlotCommand, LockSlotCommandHandler, SlotReservationService } from '@/domains/booking';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';
import { z } from 'zod';

export async function POST(req: Request) {
  let therapistId = '';
  let date = '';
  let time = '';
  let userId = '';
  let slotId = '';
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'lock_slot', 10, 60000);
    if (!rateCheck.success) {
      logger.warn('BOOKING', 'Rate limit exceeded for lock-slot', { ip: clientIp });
      return NextResponse.json({ error: 'Too many slot lock requests. Please wait a moment.' }, { status: 429 });
    }

    const session = await verifySession(req);
    const guestId = `guest_${crypto.randomUUID()}`;
    userId = session?.uid || guestId;

    const body = await req.json();
    const parsed = lockSlotSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn('BOOKING', 'lock-slot invalid input format', { ip: clientIp });
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }
    therapistId = parsed.data.therapistId;
    date = parsed.data.date;
    time = parsed.data.time;

    const therapistDoc = await adminDb.collection('therapists').doc(therapistId).get();
    if (!therapistDoc.exists) {
       logger.warn('BOOKING', 'lock-slot therapist not found', { therapistId });
       return NextResponse.json({ error: 'Therapist not found' }, { status: 404 });
    }
    
    slotId = SlotReservationService.getSlotId(therapistId, date, time);

    const command = new LockSlotCommand(therapistId, date, time, userId);
    const handler = new LockSlotCommandHandler();
    const result = await handler.execute(command);

    if (!result.success) {
      const isReserved = result.error?.includes('reserved') || result.error?.includes('booked');
      return NextResponse.json(
        { success: false, error: result.error || 'Slot is currently unavailable.' },
        { status: isReserved ? 409 : 400 }
      );
    }

    logger.info('BOOKING', 'Slot lock acquired successfully', { slotId });
    return NextResponse.json({ success: true, lockId: result.lockId });
  } catch (error) {
    logger.error('BOOKING', 'lock-slot error encountered', error);
    return NextResponse.json({ success: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

const releaseSchema = z.object({
  therapistId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  lockId: z.string().min(1),
}).strict();

export async function DELETE(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'release_slot', 20, 60000);
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json();
    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input data', details: parsed.error.format() }, { status: 400 });
    }

    const { therapistId, date, time, lockId } = parsed.data;
    const session = await verifySession(req);
    const released = await SlotReservationService.releaseLock(
      therapistId,
      date,
      time,
      lockId,
      session?.uid
    );

    return NextResponse.json({ success: released });
  } catch (error) {
    logger.error('BOOKING', 'release-slot error encountered', error);
    return NextResponse.json({ success: false, error: 'Failed to release lock.' }, { status: 500 });
  }
}

