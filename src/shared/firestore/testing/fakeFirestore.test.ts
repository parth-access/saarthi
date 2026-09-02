import { describe, it, expect } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { FakeFirestore } from './fakeFirestore';

/**
 * The harness that the command tests rely on, checked against the three
 * firebase-admin behaviours it claims to model. Without this file a silently
 * permissive fake would make every test that uses it vacuous.
 *
 * Each expected message here was produced by the real serializer (firebase-admin
 * 13) and copied verbatim.
 */
describe('FakeFirestore', () => {
  it('rejects a read issued after the first write, as production did', async () => {
    const db = new FakeFirestore({ 'bookings/bk_1': { status: 'confirmed' } });

    await expect(
      db.runTransaction(async (tx) => {
        tx.update(db.collection('bookings').doc('bk_1'), { status: 'cancelled' });
        // The shape of the production 500: a helper reads late in the body.
        await tx.get(db.collection('locked_slots').doc('th_1_2026-09-05_09:00'));
      })
    ).rejects.toThrow('Firestore transactions require all reads to be executed before all writes.');
  });

  it('allows any number of reads before the first write', async () => {
    const db = new FakeFirestore({ 'bookings/bk_1': { status: 'confirmed' } });

    const seen = await db.runTransaction(async (tx) => {
      const a = await tx.get(db.collection('bookings').doc('bk_1'));
      const b = await tx.get(db.collection('bookings').doc('bk_missing'));
      tx.set(db.collection('audit_logs').doc(), { eventType: 'X' });
      return [a.exists, b.exists];
    });

    expect(seen).toEqual([true, false]);
    expect(db.reads).toEqual(['bookings/bk_1', 'bookings/bk_missing']);
  });

  it('rejects a sentinel inside an array, at the depth production hit', async () => {
    const db = new FakeFirestore({ 'bookings/bk_1': {} });

    await expect(
      db.runTransaction(async (tx) => {
        tx.update(db.collection('bookings').doc('bk_1'), {
          rescheduleHistory: [{ rescheduledAt: FieldValue.serverTimestamp() }],
        });
      })
    ).rejects.toThrow(
      'FieldValue.serverTimestamp() cannot be used inside of an array ' +
        '(found in field "rescheduleHistory.`0`.rescheduledAt")'
    );
  });

  it('accepts a sentinel at the top level and inside a map', async () => {
    // Sentinels are only banned inside arrays; `updatedAt`/`payload.timestamp`
    // across this codebase depend on that.
    const db = new FakeFirestore({ 'bookings/bk_1': {} });

    await db.runTransaction(async (tx) => {
      tx.set(
        db.collection('bookings').doc('bk_1'),
        { updatedAt: FieldValue.serverTimestamp(), payload: { at: FieldValue.serverTimestamp() } },
        { merge: true }
      );
    });

    const stored = db.docs.get('bookings/bk_1') as { updatedAt: Timestamp; payload: { at: Timestamp } };
    expect(stored.updatedAt.toDate().toISOString()).toBe('2026-09-02T12:00:00.000Z');
    expect(stored.payload.at.toDate().toISOString()).toBe('2026-09-02T12:00:00.000Z');
  });

  it('rejects an undefined value, which this project never opts out of', async () => {
    // `admin.initializeApp` here does not set `ignoreUndefinedProperties`, so one
    // optional field left undefined aborts the whole transaction.
    const db = new FakeFirestore();

    await expect(
      db.runTransaction(async (tx) => {
        tx.create(db.collection('outbox_events').doc('evt_1'), {
          name: 'BookingRejected',
          payload: { customNote: undefined },
        });
      })
    ).rejects.toThrow('Cannot use "undefined" as a Firestore value (found in field "payload.customNote")');
  });

  it('does not commit anything when the body throws', async () => {
    const db = new FakeFirestore({ 'bookings/bk_1': { status: 'confirmed' } });

    await expect(
      db.runTransaction(async (tx) => {
        tx.update(db.collection('bookings').doc('bk_1'), { status: 'cancelled' });
        throw new Error('policy check failed');
      })
    ).rejects.toThrow('policy check failed');

    expect(db.docs.get('bookings/bk_1')).toEqual({ status: 'confirmed' });
    expect(db.writes).toHaveLength(0);
    // Staged-but-rolled-back is still observable, so a test can tell "never
    // attempted" from "attempted and discarded".
    expect(db.staged).toHaveLength(1);
  });

  it('enforces create/update preconditions at commit', async () => {
    const db = new FakeFirestore({ 'outbox_events/evt_1': { status: 'processed' } });

    await expect(
      db.runTransaction(async (tx) => tx.create(db.collection('outbox_events').doc('evt_1'), { a: 1 }))
    ).rejects.toThrow('6 ALREADY_EXISTS');
    expect(db.docs.get('outbox_events/evt_1')).toEqual({ status: 'processed' });

    await expect(
      db.runTransaction(async (tx) => tx.update(db.collection('bookings').doc('nope'), { a: 1 }))
    ).rejects.toThrow('5 NOT_FOUND');
  });

  it('merges, replaces and deletes the way Firestore does', async () => {
    const db = new FakeFirestore({ 'bookings/bk_1': { a: 1, b: 2, gone: 'x' } });
    const ref = db.collection('bookings').doc('bk_1');

    await db.runTransaction(async (tx) => tx.set(ref, { b: 3, gone: FieldValue.delete() }, { merge: true }));
    expect(db.docs.get('bookings/bk_1')).toEqual({ a: 1, b: 3 });

    await db.runTransaction(async (tx) => tx.set(ref, { only: true }));
    expect(db.docs.get('bookings/bk_1')).toEqual({ only: true });

    await db.runTransaction(async (tx) => tx.delete(ref));
    expect(db.docs.has('bookings/bk_1')).toBe(false);
  });

  it('records committed writes per collection for assertions', async () => {
    const db = new FakeFirestore({ 'bookings/bk_1': {} });

    await db.runTransaction(async (tx) => {
      tx.set(db.collection('bookings').doc('bk_1'), { status: 'cancelled' }, { merge: true });
      tx.set(db.collection('audit_logs').doc(), { eventType: 'ONE' });
      tx.set(db.collection('audit_logs').doc(), { eventType: 'TWO' });
    });

    expect(db.writesTo('audit_logs').map((w) => w.data.eventType)).toEqual(['ONE', 'TWO']);
    expect(db.writesTo('bookings')).toHaveLength(1);
    // Auto-ids are distinct, so two audit rows never collapse into one document.
    expect(new Set(db.writesTo('audit_logs').map((w) => w.path)).size).toBe(2);
  });
});
