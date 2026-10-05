import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/app/api/_lib/cronAuth';
import { logger } from '@/app/api/_lib/logger';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { GoogleCalendarService } from '@/services/googleCalendarService';

export const dynamic = 'force-dynamic';

/**
 * Re-drives Google Calendar/Meet creation for confirmed bookings whose calendar
 * creation previously failed or is still pending (calendarStatus RETRY_REQUIRED/FAILED/PENDING
 * with no meetingUrl). `createOrSyncCalendarEvent` is idempotent — it never creates a
 * duplicate event/meeting and never fabricates a link — so this is safe to run repeatedly.
 */
export async function GET(req: Request) {
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  try {
    const bookings = await firestoreBookingRepository.findBookingsNeedingCalendarRetry(25);

    let created = 0;
    let stillPending = 0;
    let failed = 0;

    for (const booking of bookings) {
      try {
        const result = await GoogleCalendarService.createOrSyncCalendarEvent(booking.id);
        if (result.success) {
          created++;
        } else {
          stillPending++;
        }
      } catch (err) {
        failed++;
        logger.error('CRON', 'retry-calendar error for booking', { bookingId: booking.id, error: String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      scanned: bookings.length,
      created,
      stillPending,
      failed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('CRON', 'Cron retry-calendar batch error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal Server Error'
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
