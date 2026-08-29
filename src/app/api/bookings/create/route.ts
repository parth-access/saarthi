import { NextResponse } from 'next/server';
import { CreateBookingCommand, CreateBookingCommandHandler } from '@/domains/booking';
import { bookingSchema } from '@/server/validators/bookingValidators';
import { logger } from '../../_lib/logger';
import { adminAuth } from '@/lib/firebase/admin';
import { checkRateLimit } from '../../_lib/rateLimit';

export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'bookings_create', 5, 60000);
    if (!rateCheck.success) {
      logger.warn('BOOKING', 'Rate limit exceeded for booking creation', { ip: clientIp });
      return NextResponse.json({ error: 'Too many booking requests. Please try again in a minute.' }, { status: 429 });
    }

    const sessionToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    let uid = 'guest';
    let authenticatedEmail: string | undefined;
    let authenticatedName: string | undefined;

    if (sessionToken) {
      try {
        const decoded = await adminAuth.verifyIdToken(sessionToken);
        uid = decoded.uid;
        authenticatedEmail = decoded.email;
        authenticatedName = decoded.name;
      } catch (authErr) {
        logger.warn('BOOKING', 'Invalid ID token provided on booking creation', { authErr });
      }
    }

    const body = await request.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    // Force normalized email casing & trim
    const normalizedClientEmail = parsed.data.email.trim().toLowerCase();
    const normalizedClientName = parsed.data.name.trim();

    // If user is authenticated, override identity with verified token claims
    const email = (authenticatedEmail || normalizedClientEmail).trim().toLowerCase();
    const name = (authenticatedName || normalizedClientName).trim();

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
    } else if (rawMsg.includes('Therapist not found') || rawMsg.includes('Validation')) {
      clientMsg = rawMsg;
      status = 400;
    }

    return NextResponse.json({ error: clientMsg }, { status });
  }
}

