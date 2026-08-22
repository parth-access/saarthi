import { NextResponse } from 'next/server';
import { SessionReminderService } from '@/services/sessionReminderService';
import { verifyCronAuth } from '@/app/api/_lib/cronAuth';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  try {
    const result = await SessionReminderService.processDueReminders(25);
    logger.info('REMINDER', 'Periodic session reminders check completed', result);
    return NextResponse.json({
      success: true,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('REMINDER', 'Cron session reminders processing error', error);
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

