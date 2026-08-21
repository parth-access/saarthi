import { NextResponse } from 'next/server';
import { SessionLifecycleService } from '@/services/sessionLifecycleService';
import { logger } from '@/app/api/_lib/logger';

export async function GET(req: Request) {
  return handleCompletionCron(req);
}

export async function POST(req: Request) {
  return handleCompletionCron(req);
}

async function handleCompletionCron(req: Request) {
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is configured, enforce authorization
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info('CRON', 'Starting session auto-completion cron task');
    const result = await SessionLifecycleService.autoCompletePastSessions();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('CRON', 'Failed to run session auto-completion cron task', { error: errorMsg });
    return NextResponse.json(
      {
        success: false,
        error: errorMsg
      },
      { status: 500 }
    );
  }
}
