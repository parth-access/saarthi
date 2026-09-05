import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readAdminPayments } from './paymentSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The payments trace: one payment seen from both sides at once.
 *
 * `?q=` is an order id, a payment id or a booking id. The handler resolves it to
 * the `payments` document and the booking independently and returns both, plus a
 * server-derived receipt number; the browser runs `reconcilePayment` over them to
 * surface where they disagree. Without `q`, only the recent-orders list is read.
 *
 * Read-only, and deliberately so. Capturing or refunding a payment moves real
 * money and is driven by the gateway flow and the refunds cron, which hold
 * credentials a browser session does not; this route offers no such action, and
 * the screen says where those live rather than presenting a button that would do
 * nothing — or, if wired, do something irreversible on a misclick.
 *
 * Nothing raw crosses the wire: a Firestore or gateway error is logged server-side
 * and the browser gets fixed copy, so an index-creation URL or project id in an
 * error message is never rendered.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const query = new URL(req.url).searchParams.get('q');
    const payments = await readAdminPayments(query);
    return NextResponse.json(
      { success: true, ...payments },
      {
        headers: {
          // Scoped to one admin's session and stale the moment it is cached.
          'Cache-Control': 'private, no-store',
        },
      }
    );
  } catch (error) {
    // The trace and the scan each catch their own failure, so reaching here means
    // the assembly itself broke. The real error goes to the server log only.
    logger.error('PAYMENT', 'Admin payments failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load payments right now. Please try again.' },
      { status: 500 }
    );
  }
}
