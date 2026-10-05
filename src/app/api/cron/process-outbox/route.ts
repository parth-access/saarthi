import { NextResponse } from 'next/server';
import { OutboxProcessor } from '@/shared/events/outbox';
import { verifyCronAuth } from '@/app/api/_lib/cronAuth';
import { logger } from '@/app/api/_lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  try {
    const result = await OutboxProcessor.processBatch(25);
    return NextResponse.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('CRON', 'Cron process outbox batch error', error);
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

