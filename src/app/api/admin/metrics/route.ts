import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { logger } from '../../_lib/logger';
import { computeBusinessMetrics, istMonth, type MetricsBookingRow } from '@/domains/admin/businessMetrics';

export const dynamic = 'force-dynamic';

const MONTHS = 6;
const SCAN_CAP = 5000;

/**
 * Revenue and booking metrics for the last six months (IST, by session date).
 * Separate from /api/admin/overview so the operations queues never wait on it.
 * One range read on `date` (single-field index) and a projection of the five
 * fields the arithmetic needs.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const now = new Date();
    const from = `${istMonth(now, -(MONTHS - 1))}-01`;
    const snap = await adminDb
      .collection('bookings')
      .where('date', '>=', from)
      .select('date', 'status', 'paymentStatus', 'paymentAmount', 'refundAmount')
      .limit(SCAN_CAP + 1)
      .get();

    const rows = snap.docs.slice(0, SCAN_CAP).map((d) => d.data() as MetricsBookingRow);
    const metrics = computeBusinessMetrics(rows, now, MONTHS, snap.size > SCAN_CAP);

    return NextResponse.json({ success: true, ...metrics }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('SYSTEM', 'Admin metrics failed', error);
    return NextResponse.json({ success: false, error: 'We could not load the metrics right now.' }, { status: 500 });
  }
}
