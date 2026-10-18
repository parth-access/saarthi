import { describe, it, expect } from 'vitest';
import { groupClients, clientKey } from './clientHistory';
import type { Booking } from '@/types';

const b = (o: Partial<Booking>): Booking =>
  ({ id: o.id ?? Math.random().toString(36), name: 'Asha', email: 'asha@x.com', phone: '', gender: '', sessionType: 'Individual', message: '', status: 'completed', date: '2026-10-01', time: '10:00', therapistId: 't', ...o }) as Booking;

describe('groupClients', () => {
  it('groups by account, else by case-insensitive email', () => {
    const clients = groupClients(
      [b({ userId: 'u1' }), b({ userId: 'u1', date: '2026-09-01' }), b({ email: 'GUEST@x.com' }), b({ email: 'guest@x.com' })],
      '2026-10-18'
    );
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.sessions.length).sort()).toEqual([2, 2]);
    expect(clientKey({ email: ' A@B.com ' })).toBe('e:a@b.com');
  });

  it('ignores abandoned checkouts and counts statuses', () => {
    const [c] = groupClients(
      [
        b({ status: 'completed', date: '2026-10-01', followUpStatus: 'recommended' } as Partial<Booking>),
        b({ status: 'confirmed', date: '2026-10-25' }),
        b({ status: 'cancelled', date: '2026-09-20' }),
        b({ status: 'no_show', date: '2026-09-10' }),
        b({ status: 'expired', date: '2026-09-05', paymentStatus: 'unpaid' }),
      ],
      '2026-10-18'
    );
    expect(c).toMatchObject({ completed: 1, upcoming: 1, cancelled: 1, noShow: 1, lastSessionDate: '2026-10-01', nextSessionDate: '2026-10-25', followUpRecommended: true });
    expect(c.sessions).toHaveLength(4);
  });

  it('puts clients with an upcoming session first', () => {
    const list = groupClients(
      [b({ userId: 'old', date: '2026-10-10' }), b({ userId: 'soon', status: 'confirmed', date: '2026-10-20' })],
      '2026-10-18'
    );
    expect(list[0].key).toBe('u:soon');
  });
});
