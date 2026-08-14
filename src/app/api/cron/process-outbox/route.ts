import { NextResponse } from 'next/server';
import { OutboxProcessor } from '@/shared/events/outbox';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await OutboxProcessor.processBatch(25);
    return NextResponse.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Cron Process Outbox] Error processing batch:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal Server Error'
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
