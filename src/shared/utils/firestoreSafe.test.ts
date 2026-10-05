import { describe, it, expect } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  isFirestoreSentinel,
  toArraySafeTimestamp,
  findSentinelInsideArray,
  assertNoSentinelsInsideArrays,
  pruneUndefined,
} from './firestoreSafe';

/**
 * The write-shape guards, tested against real firebase-admin sentinels rather
 * than hand-rolled look-alikes. That distinction matters: the admin SDK exposes
 * its marker as a prototype getter named `methodName`, so `Object.keys()` on a
 * sentinel is empty and a guard written against the web SDK's `_methodName`
 * would quietly match nothing. These are the guards that stand between an
 * optional field and a 500, so a vacuous test here is worse than none.
 */
describe('isFirestoreSentinel', () => {
  it('recognises every FieldValue the codebase uses', () => {
    expect(isFirestoreSentinel(FieldValue.serverTimestamp())).toBe(true);
    expect(isFirestoreSentinel(FieldValue.delete())).toBe(true);
    expect(isFirestoreSentinel(FieldValue.increment(1))).toBe(true);
    expect(isFirestoreSentinel(FieldValue.arrayUnion('a'))).toBe(true);
    expect(isFirestoreSentinel(FieldValue.arrayRemove('a'))).toBe(true);
  });

  it('recognises a web-SDK-shaped sentinel too', () => {
    expect(isFirestoreSentinel({ _methodName: 'serverTimestamp' })).toBe(true);
  });

  it('treats concrete values as concrete', () => {
    for (const value of [
      Timestamp.now(),
      new Date(),
      '2026-09-02T12:00:00.000Z',
      1757000000000,
      null,
      undefined,
      0,
      '',
      {},
      [],
      { methodName: 42 },
    ]) {
      expect(isFirestoreSentinel(value)).toBe(false);
    }
  });
});

describe('toArraySafeTimestamp', () => {
  const fallback = new Date('2026-09-02T12:00:00.000Z');

  it('substitutes a concrete instant for a sentinel, since arrays reject them', () => {
    expect(toArraySafeTimestamp(FieldValue.serverTimestamp(), fallback)).toBe(fallback);
  });

  it('passes concrete values through so callers keep control of the clock', () => {
    const stamp = Timestamp.fromDate(new Date('2026-08-01T00:00:00.000Z'));
    expect(toArraySafeTimestamp(stamp, fallback)).toBe(stamp);
    expect(toArraySafeTimestamp('2026-08-01T00:00:00.000Z', fallback)).toBe('2026-08-01T00:00:00.000Z');
  });

  it('fills in the fallback for a missing value', () => {
    expect(toArraySafeTimestamp(undefined, fallback)).toBe(fallback);
    expect(toArraySafeTimestamp(null, fallback)).toBe(fallback);
  });
});

describe('findSentinelInsideArray', () => {
  it('reports the exact path production reported', () => {
    // The `/api/bookings/reschedule-self` 500, reduced to its payload.
    const payload = { rescheduleHistory: [{ rescheduledAt: FieldValue.serverTimestamp() }] };
    expect(findSentinelInsideArray(payload)).toBe('rescheduleHistory.0.rescheduledAt');
  });

  it('finds one at any depth beneath an array element', () => {
    expect(findSentinelInsideArray({ a: [{ b: { c: [FieldValue.increment(1)] } }] })).toBe('a.0.b.c.0');
  });

  it('allows sentinels at the top level and inside maps', () => {
    // `updatedAt`, `declinedAt` and `payload.timestamp` across this codebase all
    // depend on this being legal.
    expect(findSentinelInsideArray({ updatedAt: FieldValue.serverTimestamp() })).toBeNull();
    expect(findSentinelInsideArray({ payload: { at: FieldValue.serverTimestamp() } })).toBeNull();
  });

  it('is quiet about arrays of concrete values', () => {
    expect(findSentinelInsideArray({ history: [{ at: Timestamp.now(), date: '2026-09-05' }] })).toBeNull();
  });

  it('does not mistake an arrayUnion sentinel for an array', () => {
    // arrayUnion is a legal top-level value; its own elements are checked by
    // Firestore, and this walker must not recurse into it as if it were an array.
    expect(findSentinelInsideArray({ tags: FieldValue.arrayUnion('a') })).toBeNull();
  });
});

describe('assertNoSentinelsInsideArrays', () => {
  it('names the context and the field, so the seam is obvious', () => {
    expect(() =>
      assertNoSentinelsInsideArrays(
        { rescheduleHistory: [{ rescheduledAt: FieldValue.serverTimestamp() }] },
        'BookingMapper.toPersistence(bk_1)'
      )
    ).toThrow(/BookingMapper\.toPersistence\(bk_1\).*"rescheduleHistory\.0\.rescheduledAt"/s);
  });

  it('stays out of the way of a legal payload', () => {
    expect(() =>
      assertNoSentinelsInsideArrays({ updatedAt: FieldValue.serverTimestamp() }, 'ctx')
    ).not.toThrow();
  });
});

describe('pruneUndefined', () => {
  it('drops undefined keys at every depth', () => {
    // The `/api/bookings/cancel-self` decline payload, verbatim in shape.
    const payload = {
      bookingId: 'bk_1',
      reason: 'Cancelled by client',
      declinedBy: 'uid_ananya',
      customNote: undefined,
      nested: { keep: 1, drop: undefined },
    };

    expect(pruneUndefined(payload)).toEqual({
      bookingId: 'bk_1',
      reason: 'Cancelled by client',
      declinedBy: 'uid_ananya',
      nested: { keep: 1 },
    });
    expect('customNote' in pruneUndefined(payload)).toBe(false);
  });

  it('keeps null, which means something different from absence', () => {
    expect(pruneUndefined({ refundId: null, error: null })).toEqual({ refundId: null, error: null });
  });

  it('replaces undefined array elements with null instead of reindexing', () => {
    // Dropping the element would shift every later index and silently corrupt
    // the record to save one write.
    expect(pruneUndefined({ items: ['a', undefined, 'c'] })).toEqual({ items: ['a', null, 'c'] });
  });

  it('leaves sentinels, Timestamps and Dates untouched by identity', () => {
    const sentinel = FieldValue.serverTimestamp();
    const stamp = Timestamp.now();
    const date = new Date('2026-09-02T12:00:00.000Z');

    const out = pruneUndefined({ createdAt: sentinel, at: stamp, on: date, tags: FieldValue.arrayUnion('a') });

    expect(out.createdAt).toBe(sentinel);
    expect(out.at).toBe(stamp);
    expect(out.on).toBe(date);
    expect(isFirestoreSentinel(out.tags)).toBe(true);
  });

  it('does not flatten a class instance into a plain object', () => {
    // A Timestamp walked as if it were a map would be persisted as
    // `{ _seconds, _nanoseconds }` and stop being a Timestamp.
    const out = pruneUndefined({ at: Timestamp.fromDate(new Date('2026-09-02T12:00:00.000Z')) });
    expect(out.at).toBeInstanceOf(Timestamp);
    expect((out.at as Timestamp).toDate().toISOString()).toBe('2026-09-02T12:00:00.000Z');
  });

  it('returns primitives and empty containers unchanged', () => {
    expect(pruneUndefined('a')).toBe('a');
    expect(pruneUndefined(0)).toBe(0);
    expect(pruneUndefined(null)).toBeNull();
    expect(pruneUndefined(undefined)).toBeUndefined();
    expect(pruneUndefined({})).toEqual({});
    expect(pruneUndefined([])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const input = { keep: 1, drop: undefined, nested: { drop: undefined } };
    pruneUndefined(input);
    expect('drop' in input).toBe(true);
    expect('drop' in input.nested).toBe(true);
  });
});
