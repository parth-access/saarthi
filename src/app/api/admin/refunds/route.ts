import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readAdminRefunds } from './refundSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The refunds queue: money owed that has not arrived, and money that has.
 *
 * Two bounded scans of the `refunds` collection. The outstanding one goes through
 * `findRefundsNeedingProcessing` — the same repository method the five-minute cron
 * calls — so the list an operator reads is the list the job will act on rather
 * than a second query that could drift from it.
 *
 * This route is read-only, and deliberately so. `/api/cron/process-refunds` is
 * guarded by `verifyCronAuth`, which requires a `Bearer ${CRON_SECRET}` compared
 * with `timingSafeEqual`; a browser session cannot satisfy that and must never
 * carry that secret. So there is no retry action behind this endpoint, and the
 * screen says the job drives these rather than offering a button that would do
 * nothing.
 *
 * Nothing from `refunds.error` crosses the wire. It holds an arbitrary
 * `Error.message` — a Razorpay body, or a Firestore `FAILED_PRECONDITION` carrying
 * the project id and an index-creation URL — and is classified into a closed union
 * inside `refundSources` before the response is built.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const refunds = await readAdminRefunds();
    return NextResponse.json(
      { success: true, ...refunds },
      {
        headers: {
          // A queue of unpaid refunds is stale the moment it is cached, and this
          // response is scoped to one admin's session.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    // Both scans catch their own failure, so reaching here means the assembly
    // broke. The real error goes to the server log only.
    logger.error('PAYMENT', 'Admin refunds failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load refunds right now. Please try again.' },
      { status: 500 }
    );
  }
}
