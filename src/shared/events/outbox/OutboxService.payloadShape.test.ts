import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore, asTxWriter } from '@/shared/firestore/testing/fakeFirestore';
import { OutboxService } from './OutboxService';

/**
 * The outbox's document-shape contract, checked against a Firestore stand-in that
 * rejects what the real client rejects.
 *
 * This is the regression test for a live 500: `payload` is the one free-form part
 * of an outbox row, callers build it from optional domain fields, and this app
 * never enables `ignoreUndefinedProperties`. A decline with no custom note put
 * `customNote: undefined` in the payload, which made the client reject the
 * document and abort the caller's whole transaction — the booking write, the
 * audit row and the slot release with it. `Outbox.test.ts` could not catch it:
 * its hand-rolled mock accepts any payload, so the invariant needs a fake that
 * enforces the rule.
 */
const h = vi.hoisted(() => ({ db: null as unknown as FakeFirestore }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => h.db.collection(name),
    runTransaction: (fn: Parameters<FakeFirestore['runTransaction']>[0]) => h.db.runTransaction(fn),
  },
  adminAuth: {},
}));

const event = (payload: Record<string, unknown>) => ({
  id: 'outbox_booking_bk_1_rejected',
  name: 'BookingRejected',
  aggregateType: 'booking' as const,
  aggregateId: 'bk_1',
  payload,
});

const record = (payload: Record<string, unknown>) =>
  h.db.runTransaction(async (tx) => OutboxService.recordEventInTransaction(asTxWriter(tx), event(payload)));

const stored = () => h.db.docs.get('outbox_events/outbox_booking_bk_1_rejected') as Record<string, unknown>;

describe('OutboxService document shape', () => {
  beforeEach(() => {
    h.db = new FakeFirestore({}, new Date('2026-09-02T12:00:00.000Z'));
  });

  it('records an event whose payload carries an absent optional field', async () => {
    // The exact payload `/api/bookings/cancel-self` produces for a decline.
    await record({
      bookingId: 'bk_1',
      therapistId: 'th_1',
      previousStatus: 'pending',
      targetStatus: 'rejected',
      reason: 'Cancelled by client',
      declinedBy: 'uid_ananya',
      customNote: undefined,
      timestamp: FieldValue.serverTimestamp(),
    });

    const payload = stored().payload as Record<string, unknown>;
    expect(payload.reason).toBe('Cancelled by client');
    expect(payload.declinedBy).toBe('uid_ananya');
    // Dropped, not stored as null: the field was never supplied.
    expect('customNote' in payload).toBe(false);
    // A sentinel nested in a map is legal, and resolves at commit.
    expect((payload.timestamp as Timestamp).toDate().toISOString()).toBe('2026-09-02T12:00:00.000Z');
  });

  it('keeps an explicit null, which is a value rather than an absence', async () => {
    await record({ bookingId: 'bk_1', refundId: null });
    expect((stored().payload as Record<string, unknown>).refundId).toBeNull();
  });

  it('preserves array positions rather than reindexing around a gap', async () => {
    await record({ bookingId: 'bk_1', attendees: ['ananya@example.com', undefined, 'priya@example.com'] });
    expect((stored().payload as Record<string, unknown>).attendees).toEqual([
      'ananya@example.com',
      null,
      'priya@example.com',
    ]);
  });

  it('still refuses to overwrite an event that already exists', async () => {
    // Pruning must not have softened the insert-only guarantee.
    await record({ bookingId: 'bk_1' });
    await expect(record({ bookingId: 'bk_1' })).rejects.toThrow(/ALREADY_EXISTS/);
  });
});
