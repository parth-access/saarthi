import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '../../_lib/logger';
import { GeneratePaymentLinkCommand, GeneratePaymentLinkCommandHandler, firestoreBookingRepository } from '@/domains/booking';
import { verifySession } from '@/lib/auth/verifySession';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const session = await verifySession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payloadSchema = z.object({
      bookingId: z.string().min(1)
    });

    const body = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { bookingId } = parsed.data;

    const booking = await firestoreBookingRepository.findById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const isAdmin = session.role === 'admin';
    const isOwner = (booking.userId && booking.userId === session.uid) ||
                    (Boolean(session.email) && Boolean(booking.email) && session.email?.toLowerCase() === booking.email?.toLowerCase());

    let isAssignedTherapist = false;
    if (session.role === 'therapist' && booking.therapistId) {
      const therapistDoc = await adminDb.collection('therapists').doc(booking.therapistId).get();
      if (therapistDoc.exists && therapistDoc.data()?.authId === session.uid) {
        isAssignedTherapist = true;
      }
    }

    if (!isAdmin && !isOwner && !isAssignedTherapist) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const command = new GeneratePaymentLinkCommand(bookingId);
    const handler = new GeneratePaymentLinkCommandHandler();
    const result = await handler.execute(command);

    return NextResponse.json({ 
      success: true, 
      bookingId,
      orderId: result.orderId,
      amount: result.amount,
      currency: result.currency
    }, { status: 200 });

  } catch (error) {
    logger.error('PAYMENT', 'Failed to create payment order', error);
    return NextResponse.json({ 
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to create payment order' 
    }, { status: 500 });
  }
}

