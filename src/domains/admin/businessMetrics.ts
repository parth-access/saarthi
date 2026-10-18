/**
 * Business metrics for the admin overview — revenue and booking counts by
 * month (IST, by session date). Pure: takes booking rows, returns numbers, so
 * the arithmetic is unit-tested without Firestore.
 *
 * Definitions (kept deliberately simple and stated in the UI):
 *  - Gross revenue: `paymentAmount` (₹) of bookings whose payment succeeded.
 *  - Refunds: `refundAmount` (paise → ₹) recorded on those bookings.
 *  - Net revenue: gross − refunds.
 *  - Sessions booked: paid bookings (confirmed, rescheduled, completed, no-show,
 *    or later cancelled/refunded).
 *  - Cancellation rate: cancelled ÷ sessions booked.
 */
export interface MetricsBookingRow {
  date?: unknown;
  status?: unknown;
  paymentStatus?: unknown;
  paymentAmount?: unknown;
  refundAmount?: unknown;
}

export interface MonthMetrics {
  /** YYYY-MM */
  month: string;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  sessionsBooked: number;
  completed: number;
  upcoming: number;
  cancelled: number;
  noShow: number;
  /** 0–1, or null when nothing was booked. */
  cancellationRate: number | null;
}

export interface BusinessMetrics {
  generatedAtIso: string;
  currentMonth: string;
  months: MonthMetrics[]; // oldest → newest, always `monthCount` entries
  /** True when the scan hit its cap, so totals are a floor. */
  truncated: boolean;
}

const PAID = new Set(['paid', 'success', 'refunded']);

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** YYYY-MM for `now` in IST, shifted by `offset` months. */
export function istMonth(now: Date, offset = 0): string {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
}

export function emptyMonth(month: string): MonthMetrics {
  return {
    month,
    grossRevenue: 0,
    refunds: 0,
    netRevenue: 0,
    sessionsBooked: 0,
    completed: 0,
    upcoming: 0,
    cancelled: 0,
    noShow: 0,
    cancellationRate: null,
  };
}

export function computeBusinessMetrics(
  rows: readonly MetricsBookingRow[],
  now: Date,
  monthCount = 6,
  truncated = false
): BusinessMetrics {
  const keys = Array.from({ length: monthCount }, (_, i) => istMonth(now, i - (monthCount - 1)));
  const byMonth = new Map(keys.map((k) => [k, emptyMonth(k)]));

  for (const row of rows) {
    const date = typeof row.date === 'string' ? row.date : '';
    const m = byMonth.get(date.slice(0, 7));
    if (!m) continue;
    const paymentStatus = String(row.paymentStatus ?? '').toLowerCase();
    if (!PAID.has(paymentStatus)) continue;

    const status = String(row.status ?? '').toLowerCase();
    m.sessionsBooked += 1;
    m.grossRevenue += num(row.paymentAmount);
    m.refunds += Math.round(num(row.refundAmount) / 100);

    if (status === 'completed') m.completed += 1;
    else if (status === 'confirmed' || status === 'rescheduled') m.upcoming += 1;
    else if (status === 'cancelled' || status === 'rejected') m.cancelled += 1;
    else if (status === 'no_show') m.noShow += 1;
  }

  const months = keys.map((k) => {
    const m = byMonth.get(k)!;
    m.netRevenue = Math.max(0, m.grossRevenue - m.refunds);
    m.cancellationRate = m.sessionsBooked > 0 ? m.cancelled / m.sessionsBooked : null;
    return m;
  });

  return { generatedAtIso: now.toISOString(), currentMonth: keys[keys.length - 1], months, truncated };
}
