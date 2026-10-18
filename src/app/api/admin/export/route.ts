import { NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '../../_lib/rateLimit';
import { logger } from '../../_lib/logger';
import { toCsv, istDateTime, type CsvValue } from '@/domains/admin/csv';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 10_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

/**
 * CSV export for accounting: GET /api/admin/export?type=bookings|payments&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * - bookings: by SESSION date; one row per booking with its payment/refund state.
 *   Free-text the client typed (their note to the therapist) and session notes
 *   are deliberately NOT exported — they can carry health disclosures.
 * - payments: by payment CREATED date (IST), from the payments collection.
 * Each export is written to audit_logs (who, what, which range, how many rows).
 */
function istDayStartUtc(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00+05:30`));
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function amount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  if (!checkRateLimit(getClientIp(req), 'admin_export', 10, 60_000).success) {
    return NextResponse.json({ error: 'Too many exports in a short time. Wait a minute and try again.' }, { status: 429 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (type !== 'bookings' && type !== 'payments') {
    return NextResponse.json({ error: 'type must be bookings or payments.' }, { status: 400 });
  }
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: 'Choose a valid date range.' }, { status: 400 });
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Export at most ${MAX_RANGE_DAYS} days at a time.` }, { status: 400 });
  }

  try {
    let csv: string;
    let rowCount: number;
    let truncated: boolean;

    if (type === 'bookings') {
      const snap = await adminDb
        .collection('bookings')
        .where('date', '>=', from)
        .where('date', '<=', to)
        .orderBy('date')
        .limit(MAX_ROWS + 1)
        .get();
      truncated = snap.size > MAX_ROWS;
      const docs = snap.docs.slice(0, MAX_ROWS);

      // Therapist names, one read per distinct therapist.
      const ids = Array.from(new Set(docs.map((d) => str(d.data().therapistId)).filter(Boolean)));
      const names = new Map<string, string>();
      await Promise.all(
        ids.map(async (id) => {
          const t = await adminDb.collection('therapists').doc(id).get();
          names.set(id, str(t.data()?.name) || id);
        })
      );

      const rows: CsvValue[][] = docs.map((d) => {
        const b = d.data();
        const refundPaise = amount(b.refundAmount);
        return [
          d.id,
          str(b.date),
          str(b.time),
          names.get(str(b.therapistId)) ?? str(b.therapistId),
          str(b.sessionType),
          str(b.sessionMode) || 'online',
          str(b.status),
          str(b.name),
          str(b.email),
          str(b.phone),
          str(b.paymentStatus),
          amount(b.paymentAmount),
          str(b.paymentCurrency) || 'INR',
          refundPaise === null ? null : Math.round(refundPaise) / 100,
          str(b.refundStatus),
          str(b.razorpayOrderId),
          str(b.razorpayPaymentId),
          istDateTime(b.createdAt),
        ];
      });
      csv = toCsv(
        [
          'Booking ID', 'Session date', 'Session time (IST)', 'Therapist', 'Session type', 'Mode', 'Status',
          'Client name', 'Client email', 'Client phone', 'Payment status', 'Amount (INR)', 'Currency',
          'Refunded (INR)', 'Refund status', 'Razorpay order ID', 'Razorpay payment ID', 'Booked at (IST)',
        ],
        rows
      );
      rowCount = rows.length;
    } else {
      const start = Timestamp.fromDate(istDayStartUtc(from));
      const end = Timestamp.fromDate(new Date(istDayStartUtc(to).getTime() + 86_400_000));
      const snap = await adminDb
        .collection('payments')
        .where('createdAt', '>=', start)
        .where('createdAt', '<', end)
        .orderBy('createdAt')
        .limit(MAX_ROWS + 1)
        .get();
      truncated = snap.size > MAX_ROWS;
      const rows: CsvValue[][] = snap.docs.slice(0, MAX_ROWS).map((d) => {
        const p = d.data();
        return [
          d.id,
          str(p.bookingId),
          str(p.status),
          amount(p.amount),
          str(p.currency) || 'INR',
          str(p.razorpayOrderId),
          str(p.razorpayPaymentId),
          str(p.method),
          istDateTime(p.createdAt),
          istDateTime(p.updatedAt),
        ];
      });
      csv = toCsv(
        ['Payment ID', 'Booking ID', 'Status', 'Amount (INR)', 'Currency', 'Razorpay order ID', 'Razorpay payment ID',
          'Method', 'Created (IST)', 'Updated (IST)'],
        rows
      );
      rowCount = rows.length;
    }

    await adminDb.collection('audit_logs').add({
      eventType: 'ADMIN_DATA_EXPORTED',
      userId: session.uid,
      after: { type, from, to, rows: rowCount, truncated },
      details: `Admin ${session.uid} exported ${rowCount} ${type} (${from} → ${to})`,
      timestamp: FieldValue.serverTimestamp(),
    });

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="saarthi-${type}-${from}-to-${to}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Export-Rows': String(rowCount),
        'X-Export-Truncated': truncated ? '1' : '0',
      },
    });
  } catch (error) {
    logger.error('SYSTEM', 'Admin export failed', error, { type, from, to });
    return NextResponse.json({ error: 'The export could not be created. Please try again.' }, { status: 500 });
  }
}
