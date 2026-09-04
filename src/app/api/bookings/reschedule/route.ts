import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTherapist } from '@/lib/auth/requireRole';
import { RescheduleBookingCommand, RescheduleBookingCommandHandler } from '@/domains/booking';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';

const schema = z.object({
  bookingId: z.string().min(1),
  newDate: z.string().min(1),
  newTime: z.string().min(1)
}).strict();

export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'reschedule_therapist', 10, 60000);
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many reschedule attempts. Please wait.' }, { status: 429 });
    }

    const authResult = await requireTherapist(req);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload format', details: parsed.error.format() }, { status: 400 });
    }
    
    const { bookingId, newDate, newTime } = parsed.data;

    const command = new RescheduleBookingCommand(bookingId, newDate, newTime, {
      uid: session.uid,
      role: session.role
    });
    const handler = new RescheduleBookingCommandHandler();
    await handler.execute(command);

    logger.info('BOOKING', 'Booking rescheduled successfully by therapist', { bookingId, newDate, newTime, therapistUid: session.uid });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('BOOKING', 'Therapist reschedule failed', error);

    const rawMsg = error instanceof Error ? error.message : String(error);
    
    if (rawMsg.includes('unavailable') || rawMsg.includes('already booked')) {
      return NextResponse.json({ success: false, error: rawMsg }, { status: 409 });
    }

    if (rawMsg.includes('current session time')) {
      return NextResponse.json({ success: false, error: rawMsg }, { status: 400 });
    }
    
    if (rawMsg.includes('Unauthorized') || rawMsg.includes('not found')) {
      return NextResponse.json({ success: false, error: rawMsg }, { status: 403 });
    }

    return NextResponse.json({ success: false, error: 'Failed to reschedule booking due to an internal server error.' }, { status: 500 });
  }
}

