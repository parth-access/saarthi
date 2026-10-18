import { describe, it, expect } from 'vitest';
import { computeBusinessMetrics, istMonth } from './businessMetrics';

const NOW = new Date('2026-10-18T08:00:00Z');

describe('computeBusinessMetrics', () => {
  it('builds six months ending with the current IST month', () => {
    const m = computeBusinessMetrics([], NOW);
    expect(m.months.map((x) => x.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(m.currentMonth).toBe('2026-10');
  });

  it('counts only paid bookings, nets refunds (paise) and computes cancellation rate', () => {
    const m = computeBusinessMetrics(
      [
        { date: '2026-10-02', status: 'completed', paymentStatus: 'paid', paymentAmount: 1500 },
        { date: '2026-10-20', status: 'confirmed', paymentStatus: 'paid', paymentAmount: 1500 },
        { date: '2026-10-05', status: 'cancelled', paymentStatus: 'refunded', paymentAmount: 1500, refundAmount: 150000 },
        { date: '2026-10-06', status: 'no_show', paymentStatus: 'success', paymentAmount: 2000 },
        { date: '2026-10-07', status: 'awaiting_payment', paymentStatus: 'unpaid', paymentAmount: 1500 },
        { date: '2026-01-07', status: 'completed', paymentStatus: 'paid', paymentAmount: 1500 },
      ],
      NOW
    );
    const oct = m.months[5];
    expect(oct.sessionsBooked).toBe(4);
    expect(oct.grossRevenue).toBe(6500);
    expect(oct.refunds).toBe(1500);
    expect(oct.netRevenue).toBe(5000);
    expect(oct).toMatchObject({ completed: 1, upcoming: 1, cancelled: 1, noShow: 1 });
    expect(oct.cancellationRate).toBeCloseTo(0.25);
  });

  it('handles the IST month boundary', () => {
    // 2026-10-31T19:00Z is already 1 Nov in IST.
    expect(istMonth(new Date('2026-10-31T19:00:00Z'))).toBe('2026-11');
  });
});
