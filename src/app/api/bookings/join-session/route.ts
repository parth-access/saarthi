import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { GoogleCalendarService } from '@/services/googleCalendarService';
import { logger } from '@/app/api/_lib/logger';
import { getClientIp } from '../../_lib/rateLimit';
import { checkDistributedRateLimit } from '../../_lib/distributedRateLimit';

export async function GET(req: NextRequest) {
  try {
    // join-session can trigger on-demand Google Calendar/Meet creation — an
    // expensive operation — so it is throttled per client.
    const clientIp = getClientIp(req);
    if (!(await checkDistributedRateLimit(clientIp, 'join_session', 10, 60_000)).success) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    // 1. Verify Authentication. verifySession accepts the Bearer ID token,
    // re-reads the role live from `users`, and refuses disabled accounts and
    // revoked sessions. It only exposes a verified email, since unverified
    // emails are not ownership proof (anyone can register any address).
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.uid;
    const userEmail = session.email;
    const userRole = session.role || 'client';

    // 2. Retrieve Booking
    const booking = await firestoreBookingRepository.findById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // 3. Authorization Check
    // Allowed if:
    // a) User is the student (userId === booking.userId || userEmail === booking.email)
    // b) User is assigned therapist (therapist authId === userId || booking.therapistId === userId)
    // c) User is admin per the users collection

    let isAuthorized = false;

    if (booking.userId === userId || (userEmail && booking.email && userEmail.toLowerCase() === booking.email.toLowerCase())) {
      isAuthorized = true;
    }

    if (!isAuthorized && userRole === 'admin') {
      isAuthorized = true;
    }

    if (!isAuthorized && booking.therapistId) {
      try {
        const therapistSnap = await adminDb.collection('therapists').doc(booking.therapistId).get();
        if (therapistSnap.exists) {
          const therapistData = therapistSnap.data();
          if (therapistData?.authId === userId || therapistData?.id === userId) {
            isAuthorized = true;
          }
        }
      } catch (tErr) {
        logger.warn('JOIN_SESSION', 'Error verifying therapist authorization', { error: String(tErr) });
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden: you do not have permission to access this session link' }, { status: 403 });
    }

    // 4. Ensure Calendar Event & Meeting URL exists
    if (!booking.meetingUrl) {
      if (booking.status === 'confirmed') {
        logger.info('JOIN_SESSION', `Meeting URL not found for confirmed booking ${bookingId}. Dynamically generating Google Calendar event...`);
        const calResult = await GoogleCalendarService.createOrSyncCalendarEvent(bookingId);
        if (calResult.success && calResult.meetingUrl) {
          return NextResponse.json({
            success: true,
            meetingUrl: calResult.meetingUrl,
            calendarStatus: 'CREATED',
            calendarEventId: calResult.calendarEventId
          });
        } else {
          return NextResponse.json({
            success: false,
            error: calResult.error || 'Meeting URL is currently being created. Please retry in a moment.',
            calendarStatus: 'PENDING'
          }, { status: 202 });
        }
      } else {
        return NextResponse.json({
          error: `Session status is ${booking.status}. Meeting links are available once booking is confirmed.`,
          calendarStatus: booking.calendarStatus || 'NONE'
        }, { status: 400 });
      }
    }

    return NextResponse.json({
      success: true,
      meetingUrl: booking.meetingUrl,
      calendarStatus: booking.calendarStatus || 'CREATED',
      calendarEventId: booking.googleCalendarEventId
    });

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('JOIN_SESSION', 'Error fetching meeting link', { error: errorMsg });
    return NextResponse.json({ error: 'Could not fetch the session link. Please try again.' }, { status: 500 });
  }
}
