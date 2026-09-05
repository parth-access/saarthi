import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  deriveClientProfile,
  groupRecentClients,
  type AdminClientBookingRow,
} from './clientProfile';

/** A row with harmless defaults; each test overrides only what it exercises. */
function row(over: Partial<AdminClientBookingRow> = {}): AdminClientBookingRow {
  return {
    id: 'bk_1',
    email: 'a@x.com',
    name: null,
    phone: null,
    userId: null,
    therapistId: null,
    therapistName: null,
    sessionDate: null,
    sessionTime: null,
    sessionType: null,
    sessionMode: null,
    status: null,
    paymentStatus: null,
    amountRupees: null,
    currency: null,
    refundStatus: null,
    refundAmountPaise: null,
    createdAtIso: null,
    sessionStartIso: null,
    ...over,
  };
}

const NOW = Date.parse('2026-09-05T00:00:00.000Z');

describe('normalizeEmail', () => {
  it('trims and lowercases, matching the write-time normalization', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});

describe('deriveClientProfile — identity', () => {
  it('takes name and phone from the most recently created booking', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: 'old', name: 'Priya', phone: '111', createdAtIso: '2026-01-01T00:00:00Z' }),
      row({ id: 'new', name: 'Priya Sharma', phone: '222', createdAtIso: '2026-06-01T00:00:00Z' }),
    ], NOW);
    expect(profile.identity.name).toBe('Priya Sharma');
    expect(profile.identity.phone).toBe('222');
    expect(profile.identity.nameVaried).toBe(true);
    expect(profile.identity.phoneVaried).toBe(true);
  });

  it('falls back past a booking with no name to the next that has one', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: 'newest', name: null, createdAtIso: '2026-06-01T00:00:00Z' }),
      row({ id: 'older', name: 'Asha', createdAtIso: '2026-01-01T00:00:00Z' }),
    ], NOW);
    expect(profile.identity.name).toBe('Asha');
    expect(profile.identity.nameVaried).toBe(false);
  });

  it('collects distinct account ids and leaves guest-only clients empty', () => {
    const guest = deriveClientProfile('a@x.com', [row(), row({ id: 'bk_2' })], NOW);
    expect(guest.identity.userIds).toEqual([]);
    const linked = deriveClientProfile('a@x.com', [
      row({ userId: 'u2' }),
      row({ id: 'bk_2', userId: 'u1' }),
      row({ id: 'bk_3', userId: 'u1' }),
    ], NOW);
    expect(linked.identity.userIds).toEqual(['u1', 'u2']);
  });
});

describe('deriveClientProfile — status groups', () => {
  it('buckets by the canonical booking-status groups and counts the total', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: '1', status: 'completed' }),
      row({ id: '2', status: 'confirmed' }),
      row({ id: '3', status: 'rescheduled' }), // same group as confirmed
      row({ id: '4', status: 'cancelled' }),
    ], NOW);
    expect(profile.total).toBe(4);
    const byId = Object.fromEntries(profile.groups.map((g) => [g.id, g.count]));
    expect(byId).toEqual({ completed: 1, confirmed: 2, closed: 1 });
  });

  it('counts a status in no known group as unclassified rather than dropping it', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ status: 'confirmed' }),
      row({ id: 'weird', status: 'teleported' }),
    ], NOW);
    expect(profile.unclassifiedCount).toBe(1);
    expect(profile.total).toBe(2);
  });
});

describe('deriveClientProfile — upcoming', () => {
  it('counts only confirmed sessions whose instant is in the future', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: 'future', status: 'confirmed', sessionStartIso: '2026-09-06T10:00:00Z' }),
      row({ id: 'past', status: 'confirmed', sessionStartIso: '2026-09-01T10:00:00Z' }),
      row({ id: 'future-unpaid', status: 'awaiting_payment', sessionStartIso: '2026-09-07T10:00:00Z' }),
    ], NOW);
    expect(profile.upcoming.count).toBe(1);
    expect(profile.upcoming.unplaceable).toBe(0);
  });

  it('reports a confirmed session with no instant as unplaceable, not upcoming', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ status: 'confirmed', sessionStartIso: null }),
    ], NOW);
    expect(profile.upcoming.count).toBe(0);
    expect(profile.upcoming.unplaceable).toBe(1);
  });
});

describe('deriveClientProfile — money', () => {
  it('sums captured amounts and flags captured payments that carry none', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: '1', paymentStatus: 'paid', amountRupees: 1500 }),
      row({ id: '2', paymentStatus: 'success', amountRupees: 1500 }),
      row({ id: '3', paymentStatus: 'paid', amountRupees: null }), // captured, unpriced → floor
      row({ id: '4', paymentStatus: 'unpaid', amountRupees: 999 }), // not captured
    ], NOW);
    expect(profile.money.paidCount).toBe(3);
    expect(profile.money.paidRupees).toBe(3000);
    expect(profile.money.unpricedPaidCount).toBe(1);
  });

  it('treats a refunded payment as captured and totals refunds in paise', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: '1', paymentStatus: 'refunded', amountRupees: 1500, refundStatus: 'processed', refundAmountPaise: 150000 }),
      row({ id: '2', paymentStatus: 'paid', amountRupees: 1500, refundAmountPaise: 50000 }),
    ], NOW);
    expect(profile.money.paidCount).toBe(2);
    expect(profile.money.paidRupees).toBe(3000);
    expect(profile.money.refundedCount).toBe(2);
    expect(profile.money.refundedPaise).toBe(200000);
  });
});

describe('deriveClientProfile — seen window and ordering', () => {
  it('reports first and last seen from createdAt across all bookings', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: '1', createdAtIso: '2026-03-01T00:00:00Z' }),
      row({ id: '2', createdAtIso: '2026-01-01T00:00:00Z' }),
      row({ id: '3', createdAtIso: '2026-08-01T00:00:00Z' }),
    ], NOW);
    expect(profile.firstSeenIso).toBe('2026-01-01T00:00:00.000Z');
    expect(profile.lastSeenIso).toBe('2026-08-01T00:00:00.000Z');
  });

  it('orders bookings by session instant, upcoming first, holds without a date last', () => {
    const profile = deriveClientProfile('a@x.com', [
      row({ id: 'hold', status: 'draft', sessionStartIso: null, createdAtIso: null }),
      row({ id: 'past', sessionStartIso: '2026-08-01T10:00:00Z' }),
      row({ id: 'future', sessionStartIso: '2026-09-30T10:00:00Z' }),
    ], NOW);
    expect(profile.bookings.map((b) => b.id)).toEqual(['future', 'past', 'hold']);
  });
});

describe('groupRecentClients', () => {
  it('collapses bookings to distinct clients keyed by normalized email', () => {
    const clients = groupRecentClients([
      row({ id: '1', email: 'A@X.com', name: 'Asha', createdAtIso: '2026-09-01T00:00:00Z' }),
      row({ id: '2', email: 'a@x.com', name: 'Asha R', createdAtIso: '2026-09-03T00:00:00Z' }),
      row({ id: '3', email: 'b@x.com', name: 'Ben', createdAtIso: '2026-09-02T00:00:00Z' }),
    ]);
    expect(clients).toHaveLength(2);
    const asha = clients.find((c) => c.email === 'a@x.com')!;
    expect(asha.name).toBe('Asha R'); // most recently created
    expect(asha.lastActiveIso).toBe('2026-09-03T00:00:00Z');
    expect(asha.lastBooking.id).toBe('2');
  });

  it('orders clients by most recent activity and drops bookings with no email', () => {
    const clients = groupRecentClients([
      row({ id: '1', email: 'b@x.com', createdAtIso: '2026-09-01T00:00:00Z' }),
      row({ id: '2', email: 'a@x.com', createdAtIso: '2026-09-04T00:00:00Z' }),
      row({ id: '3', email: null, createdAtIso: '2026-09-09T00:00:00Z' }),
      row({ id: '4', email: '   ', createdAtIso: '2026-09-09T00:00:00Z' }),
    ]);
    expect(clients.map((c) => c.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});


