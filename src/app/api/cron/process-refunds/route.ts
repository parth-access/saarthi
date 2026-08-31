import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/app/api/_lib/cronAuth';
import { logger } from '@/app/api/_lib/logger';
import { firestoreRefundRepository, refundService } from '@/domains/payment';

export const dynamic = 'force-dynamic';

/**
 * Drives outstanding refunds to completion against Razorpay. Scans the `refunds`
 * collection for PENDING/FAILED requests and calls RefundService.processRefund on
 * each. Fully idempotent + money-safe: one refund per payment (deterministic doc id)
 * and a gateway-state reconcile before any refund is issued, so this is safe to run
 * repeatedly (every 5 min via scheduled-jobs.yml).
 */
export async function GET(req: Request) {
  const authCheck = verifyCronAuth(req);
  if (!authCheck.authorized) {
    return authCheck.response!;
  }

  try {
    const refunds = await firestoreRefundRepository.findRefundsNeedingProcessing(25);

    let processed = 0;
    let stillPending = 0;
    let failed = 0;

    for (const refund of refunds) {
      try {
        const result = await refundService.processRefund(refund.id);
        if (result.success) {
          processed++;
        } else {
          stillPending++;
        }
      } catch (err) {
        failed++;
        logger.error('CRON', 'process-refunds error for refund', { refundDocId: refund.id, error: String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      scanned: refunds.length,
      processed,
      stillPending,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('CRON', 'Cron process-refunds batch error', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
