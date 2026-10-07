import { NextResponse } from 'next/server';
import { CreateBookingCommand, CreateBookingCommandHandler } from '@/domains/booking';
import { bookingSchema } from '@/server/validators/bookingValidators';
import { logger } from '../../_lib/logger';
import { adminAuth } from '@/lib/firebase/admin';
import { getClientIp, checkRateLimit } from '../../_lib/rateLimit';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(clientIp, 'bookings_create', 5, 60000);
    if (!rateCheck.success) {
      logger.warn('BOOKING', 'Rate limit exceeded for booking creation', { ip: clientIp });
      return NextResponse.json({ error: 'Too many booking requests. Please try again in a minute.' }, { status: 429 });
    }

    const sessionToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    let uid = 'guest';

    if (sessionToken) {
      try {
        const decoded = await adminAuth.verifyIdToken(sessionToken);
        uid = decoded.uid;
      } catch (authErr) {
        logger.warn('BOOKING', 'Invalid ID token provided on booking creation', { authErr });
      }
    }

    const body = await request.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    // The booking's client identity is exactly what the person booking typed
    // in, normalized. The authenticated account contributes OWNERSHIP (the uid
    // below), never identity: a signed-in therapist or client may book with
    // any contact email, and the confirmation email, calendar invite,
    // reminders, receipt and manage-booking link all derive from this
    // persisted field. (This used to override the form email and name with the
    // token's claims, which sent a therapist's confirmation — and every other
    // client-facing email — to their login address when booking for someone
    // else.)
    const email = parsed.data.email.trim().toLowerCase();
    const name = parsed.data.name.trim();

    const bookingData = {
      ...parsed.data,
      name,
      email,
    };

    const command = new CreateBookingCommand(bookingData, uid, email);
    const handler = new CreateBookingCommandHandler();
    const result = await handler.execute(command);

    return NextResponse.json({ 
      success: true, 
      bookingId: result.bookingId,
      orderId: result.orderId,
      amount: result.amount,
      currency: result.currency
    }, { status: 201 });

  } catch (error) {
    logger.error('BOOKING', 'Failed to create booking', error);
    
    const rawMsg = error instanceof Error ? error.message : String(error);
    
    // Map known domain / slot conflict errors safely to clients
    let clientMsg = 'Failed to create booking. Please try again.';
    let status = 500;

    if (rawMsg.includes('already booked') || rawMsg.includes('reserved by another user') || rawMsg.includes('unavailable')) {
      clientMsg = rawMsg;
      status = 409;
    } else if (rawMsg.includes('not currently bookable')) {
      // A deactivated therapist: a state conflict with what the client asked
      // for, not a validation failure and not a server error.
      clientMsg = rawMsg;
      status = 409;
    } else if (rawMsg.includes('Therapist not found') || rawMsg.includes('Validation')) {
      clientMsg = rawMsg;
      status = 400;
    }

    return NextResponse.json({ error: clientMsg }, { status });
  }
}

