'use client';

/**
 * Revenue & bookings — this month vs last month, plus a six-month trend.
 * Loads on its own (GET /api/admin/metrics) so the operational queues above it
 * never wait on this read.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import type { BusinessMetrics, MonthMetrics } from '@/domains/admin/businessMetrics';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

function monthLabel(ym: string, short = false): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', {
    month: short ? 'short' : 'long',
    ...(short ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

function delta(current: number, previous: number): { text: string; tone: string } | null {
  if (previous === 0) return current === 0 ? null : { text: 'new', tone: 'text-success' };
  const change = (current - previous) / previous;
  if (Math.abs(change) < 0.005) return { text: 'no change', tone: 'text-muted-foreground' };
  return {
    text: `${change > 0 ? '▲' : '▼'} ${Math.abs(Math.round(change * 100))}% vs last month`,
    tone: change > 0 ? 'text-success' : 'text-danger',
  };
}

function Stat({ label, value, sub, d }: { label: string; value: string; sub?: string; d?: ReturnType<typeof delta> }) {
  return (
    <div className="rounded-xl bg-neutral-surface/70 px-3.5 py-3">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-primary">{value}</div>
      {d && <p className={`mt-0.5 text-[0.6875rem] font-medium ${d.tone}`}>{d.text}</p>}
      {sub && <p className="text-[0.6875rem] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Trend({ months }: { months: MonthMetrics[] }) {
  const max = Math.max(1, ...months.map((m) => m.netRevenue));
  return (
    <div className="mt-3">
      <p className="text-[0.6875rem] font-medium text-muted-foreground">Net revenue, last 6 months</p>
      <ul className="mt-2 grid grid-cols-6 items-end gap-2" aria-label="Net revenue by month">
        {months.map((m, i) => (
          <li key={m.month} className="flex flex-col items-center gap-1">
            <span className="text-[0.625rem] tabular-nums text-muted-foreground">
              {m.netRevenue > 0 ? inr(m.netRevenue) : '—'}
            </span>
            <span className="flex h-24 w-full items-end rounded bg-neutral-surface/70">
              <span
                className={`w-full rounded ${i === months.length - 1 ? 'bg-accent' : 'bg-primary/75'}`}
                style={{ height: `${Math.max(m.netRevenue > 0 ? 4 : 0, (m.netRevenue / max) * 100)}%` }}
                title={`${monthLabel(m.month)}: ${inr(m.netRevenue)} net · ${m.sessionsBooked} sessions`}
              />
            </span>
            <span className="text-[0.625rem] text-muted-foreground">{monthLabel(m.month, true)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BusinessMetricsPanel() {
  const [data, setData] = useState<BusinessMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/metrics');
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success || !Array.isArray(body.months)) {
        throw new Error(body?.error || 'We could not load the metrics right now.');
      }
      setData(body as BusinessMetrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not load the metrics right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.9375rem] font-semibold text-primary">
          Revenue &amp; bookings{data ? ` — ${monthLabel(data.currentMonth)}` : ''}
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-neutral-surface hover:text-primary disabled:opacity-50"
        >
          {loading ? 'Reading…' : 'Refresh'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}

      {!data && loading && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-surface" />
          ))}
        </div>
      )}

      {data && (() => {
        const cur = data.months[data.months.length - 1];
        const prev = data.months[data.months.length - 2] ?? cur;
        return (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Net revenue" value={inr(cur.netRevenue)} d={delta(cur.netRevenue, prev.netRevenue)}
                sub={cur.refunds > 0 ? `${inr(cur.grossRevenue)} gross − ${inr(cur.refunds)} refunds` : undefined} />
              <Stat label="Sessions booked" value={String(cur.sessionsBooked)} d={delta(cur.sessionsBooked, prev.sessionsBooked)}
                sub={`${cur.completed} done · ${cur.upcoming} upcoming`} />
              <Stat label="Cancellation rate" value={pct(cur.cancellationRate)}
                sub={`${cur.cancelled} cancelled · last month ${pct(prev.cancellationRate)}`} />
              <Stat label="No-shows" value={String(cur.noShow)} sub={`last month ${prev.noShow}`} />
            </div>
            <Trend months={data.months} />
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
              Paid sessions grouped by session date (IST). Net = payments received minus refunds recorded.
              {data.truncated ? ' Showing the first 5,000 bookings — totals are a minimum.' : ''}
            </p>
          </>
        );
      })()}
    </section>
  );
}
