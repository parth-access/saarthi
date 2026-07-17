/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { resendSavedEmailAction } from '@/app/api/email/emailSender';
import { firestoreBookingRepository } from '@/domains/booking';
import { EventBus } from '@/shared/events/EventBus';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (decodedToken.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { action, emailId, bookingId, eventName } = await req.json();

    if (action === 'resend_email') {
      if (!emailId) {
        return NextResponse.json({ error: 'Missing emailId' }, { status: 400 });
      }
      await resendSavedEmailAction(emailId);
      return NextResponse.json({ success: true, message: 'Email resent successfully' });
    }

    if (action === 'replay_event') {
      if (!bookingId || !eventName) {
        return NextResponse.json({ error: 'Missing bookingId or eventName' }, { status: 400 });
      }
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      await EventBus.publish({
        name: eventName,
        timestamp: new Date(),
        payload: {
          bookingId,
          booking,
          metadata: { replayedAt: new Date().toISOString(), replayedBy: decodedToken.uid }
        }
      });

      return NextResponse.json({ success: true, message: `Event ${eventName} replayed successfully` });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
