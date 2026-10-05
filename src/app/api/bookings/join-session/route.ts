import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { GoogleCalendarService } from '@/services/googleCalendarService';
import { logger } from '@/app/api/_lib/logger';
import { checkRateLimit, getClientIp } from '../../_lib/rateLimit';

export async function GET(req: NextRequest) {
  try {
    // join-session can trigger on-demand Google Calendar/Meet creation — an
    // expensive operation — so it is throttled per client.
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp, 'join_session', 10, 60_000).success) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    // 1. Verify Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: missing authorization header' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    // Role comes from the CANONICAL source of truth (the `users` collection,
    // re-read live) — not from Firebase custom claims, which are a second
    // authority that can go stale or never be provisioned.
    let userRole = 'client';
    try {
      const userSnap = await adminDb.collection('users').doc(userId).get();
      if (userSnap.exists) {
        userRole = (userSnap.data()?.role as string) || 'client';
      }
    } catch (roleErr) {
      logger.warn('JOIN_SESSION', 'Could not read user role; defaulting to client', { error: String(roleErr) });
    }

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
          if (therapistData?.authId === userId || therapistData?.id === userId || therapistData?.email === userEmail) {
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
    return NextResponse.json({ error: 'Failed to process request: ' + errorMsg }, { status: 500 });
  }
}
