import { NextResponse } from 'next/server';
import { CreateBookingCommand, CreateBookingCommandHandler } from '@/domains/booking';
import { bookingSchema } from '@/server/validators/bookingValidators';
import { logger } from '../../_lib/logger';
import { adminAuth } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const sessionToken = request.headers.get('Authorization')?.split('Bearer ')[1];
    let uid = 'guest';
    let email = 'guest@example.com';
    let name = 'Guest User';

    if (sessionToken) {
      const decoded = await adminAuth.verifyIdToken(sessionToken);
      uid = decoded.uid;
      email = decoded.email || email;
      name = decoded.name || name;
    }

    const body = await request.json();
    const parsed = bookingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const bookingData = {
      ...parsed.data,
      name: parsed.data.name || name,
      email: parsed.data.email || email
    };

    const command = new CreateBookingCommand(bookingData, uid, bookingData.email);
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
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to create booking' }, { status: 500 });
  }
}
