'use client';

/**
 * Earnings — the therapist's paid sessions by month, refunds, net revenue and
 * (when the practice has set it) their payout share. Built from the bookings
 * the workspace already loaded — the same arithmetic as the admin metrics, so
 * both sides always see the same numbers. Statement downloads as CSV.
 */
import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTherapistData } from '@/components/therapist/TherapistDataContext';
import { computeBusinessMetrics } from '@/domains/admin/businessMetrics';
import { toCsv } from '@/domains/admin/csv';
import { statusBadge, toneClasses } from '@/components/admin/bookings/adminBookingPresentation';
import { formatTime12h } from '@/components/booking/bookingUi';
import type { Booking } from '@/types';

const PAID = new Set(['paid', 'success', 'refunded']);
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function refundRupees(b: Booking): number {
  return typeof b.refundAmount === 'number' && b.refundAmount > 0 ? Math.round(b.refundAmount / 100) : 0;
}

export default function TherapistEarningsPage() {
  const data = useTherapistData();
  const metrics = React.useMemo(() => computeBusinessMetrics(data.bookings, new Date(), 6), [data.bookings]);
  const [month, setMonth] = React.useState(metrics.currentMonth);
  const pct = data.therapist?.payoutPercent;
  const share = (net: number) => (typeof pct === 'number' ? Math.round((net * pct) / 100) : null);

  const m = metrics.months.find((x) => x.month === month) ?? metrics.months[metrics.months.length - 1];
  const sessions = React.useMemo(
    () =>
      data.bookings
        .filter((b) => (b.date || '').startsWith(m.month) && PAID.has(String(b.paymentStatus)))
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [data.bookings, m.month]
  );

  function downloadStatement() {
    const rows = sessions.map((b) => {
      const gross = typeof b.paymentAmount === 'number' ? b.paymentAmount : 0;
      const refund = refundRupees(b);
      const net = Math.max(0, gross - refund);
      return [b.date, b.time, b.name, b.sessionType, b.status, gross, refund, net, share(net)];
    });
    rows.push(['Total', '', '', '', '', m.grossRevenue, m.refunds, m.netRevenue, share(m.netRevenue)]);
    const csv = toCsv(
      ['Date', 'Time (IST)', 'Client', 'Session type', 'Status', 'Paid (INR)', 'Refunded (INR)', 'Net (INR)',
        typeof pct === 'number' ? `Your share ${pct}% (INR)` : 'Your share (INR)'],
      rows
    );
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = `saarthi-earnings-${m.month}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }

  if (data.loading && data.bookings.length === 0) {
    return <div className="h-40 animate-pulse rounded-xl bg-white shadow-sm" aria-busy="true" />;
  }

  const myShare = share(m.netRevenue);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-hairline pb-2.5">
        <div>
          <h2 className="font-serif text-base font-semibold text-primary">Earnings</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Paid sessions by session date (IST).</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="earn-month">Month</label>
          <select id="earn-month" value={m.month} onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-sm text-primary">
            {[...metrics.months].reverse().map((x) => (
              <option key={x.month} value={x.month}>{monthLabel(x.month)}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={downloadStatement} disabled={sessions.length === 0}>
            <Download aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" /> Statement
          </Button>
        </div>
      </div>

      {typeof pct !== 'number' && (
        <p className={`rounded-lg px-3 py-2 text-xs ${toneClasses('info')}`}>
          Your payout share hasn&apos;t been set by the practice yet, so this shows session revenue only.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [myShare !== null ? `Your share (${pct}%)` : 'Net revenue', inr(myShare ?? m.netRevenue)],
          ['Paid sessions', String(m.sessionsBooked)],
          ['Collected', inr(m.grossRevenue)],
          ['Refunded', inr(m.refunds)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-hairline bg-white px-3 py-2.5 shadow-sm">
            <p className="text-[0.6875rem] font-medium text-muted-foreground">{label}</p>
            <div className="mt-0.5 text-lg font-semibold tabular-nums text-primary">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium text-primary">Last 6 months</p>
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Sessions</th>
              <th className="py-1 text-right font-medium">Net</th>
              {typeof pct === 'number' && <th className="py-1 text-right font-medium">Your share</th>}
            </tr>
          </thead>
          <tbody>
            {[...metrics.months].reverse().map((x) => (
              <tr key={x.month} className={`border-t border-hairline ${x.month === m.month ? 'font-medium text-primary' : ''}`}>
                <td className="py-1.5">
                  <button type="button" onClick={() => setMonth(x.month)} className="hover:underline">{monthLabel(x.month)}</button>
                </td>
                <td className="py-1.5 text-right tabular-nums">{x.sessionsBooked}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(x.netRevenue)}</td>
                {typeof pct === 'number' && <td className="py-1.5 text-right tabular-nums">{inr(share(x.netRevenue) ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-medium text-primary">Sessions in {monthLabel(m.month)}</p>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No paid sessions this month.</p>
        ) : (
          <ul className="divide-y divide-hairline text-xs">
            {sessions.map((b) => {
              const badge = statusBadge({ status: b.status });
              const gross = typeof b.paymentAmount === 'number' ? b.paymentAmount : 0;
              const refund = refundRupees(b);
              return (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium text-primary">{b.date}</span>
                    <span className="text-muted-foreground"> · {b.time ? formatTime12h(b.time) : ''} · {b.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(badge.tone)}`}>{badge.label}</span>
                    <span className="tabular-nums text-primary">
                      {inr(gross - refund)}
                      {refund > 0 && <span className="text-muted-foreground"> ({inr(refund)} refunded)</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
          Upcoming paid sessions are included for their month. Payout timing and method are agreed with the practice.
        </p>
      </div>
    </section>
  );
}
