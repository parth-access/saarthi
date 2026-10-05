import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_BOOKING_STATUSES,
  ALL_PAYMENT_STATUSES,
  BOOKING_STATUS_GROUPS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAYMENT_STATUS_GROUPS,
  REQUIRED_COMPOSITE_INDEXES,
  allowedAdditionalFilters,
  bookingStatusGroupFor,
  classifyBookingLookup,
  cursorForRow,
  decodeBookingCursor,
  describeBookingLookup,
  encodeBookingCursor,
  isSupportedFilterCombination,
  planAdminBookingList,
  paymentStatusGroupFor,
  toAdminBookingRow,
  type AdminBookingFilterField,
  type BookingLookupKind,
} from './adminBookingQuery';

/**
 * These are the tests that stop the bookings list from lying.
 *
 * Three of them are load-bearing beyond ordinary unit coverage:
 *
 *  - the index agreement test, because a filter combination this module promises
 *    but Firestore has no index for fails only in production, on the operator's
 *    screen, with a FAILED_PRECONDITION;
 *  - status group exhaustiveness, because a status in no group is a booking that
 *    no filter can ever surface;
 *  - the projection test, because the list is the one place a single response
 *    carries many clients' details at once, so what it omits matters as much as
 *    what it includes.
 */

/* ------------------------------------------------------------------ *
 * The map matches the territory
 * ------------------------------------------------------------------ */

interface DeclaredIndex {
  collectionGroup: string;
  queryScope: string;
  fields: { fieldPath: string; order?: string }[];
}

const declaredIndexes: DeclaredIndex[] = JSON.parse(
  readFileSync(join(process.cwd(), 'firestore.indexes.json'), 'utf8')
).indexes;

/** `bookings(date,status,createdAt DESC)` → collection + ordered field list. */
function parseIndexName(name: string): { collection: string; fields: { path: string; order: string }[] } {
  const match = /^([A-Za-z_]+)\(([^)]+)\)$/.exec(name);
  if (!match) throw new Error(`Unparseable index name: ${name}`);
  return {
    collection: match[1],
    fields: match[2].split(',').map((raw) => {
      const [path, direction] = raw.trim().split(/\s+/);
      return { path, order: direction === 'DESC' ? 'DESCENDING' : 'ASCENDING' };
    }),
  };
}

describe('every index the planner relies on is deployed', () => {
  it.each(REQUIRED_COMPOSITE_INDEXES)('%s is declared in firestore.indexes.json', (name) => {
    const wanted = parseIndexName(name);
    const match = declaredIndexes.find(
      (index) =>
        index.collectionGroup === wanted.collection &&
        index.fields.length === wanted.fields.length &&
        index.fields.every(
          (field, i) =>
            field.fieldPath === wanted.fields[i].path && field.order === wanted.fields[i].order
        )
    );
    expect(match, `no index for ${name}`).toBeDefined();
  });

  it('orders every required index by createdAt descending last', () => {
    // The plan's tie-breaker is `__name__ desc`, which Firestore only serves when
    // the index's final field is itself descending — it appends `__name__` in the
    // direction of the last declared field. An index ending `createdAt ASC` would
    // make the cursor query fail.
    for (const name of REQUIRED_COMPOSITE_INDEXES) {
      const fields = parseIndexName(name).fields;
      expect(fields[fields.length - 1], name).toEqual({ path: 'createdAt', order: 'DESCENDING' });
    }
  });
});

/* ------------------------------------------------------------------ *
 * Status vocabulary
 * ------------------------------------------------------------------ */

describe('status grouping', () => {
  it('puts every booking status in exactly one group', () => {
    // A status belonging to no group is a booking no filter can reach; a status in
    // two groups double-counts on the overview.
    for (const status of ALL_BOOKING_STATUSES) {
      const owners = BOOKING_STATUS_GROUPS.filter((group) =>
        (group.statuses as readonly string[]).includes(status)
      );
      expect(owners.map((g) => g.id), status).toHaveLength(1);
    }
  });

  it('puts every payment status in exactly one group', () => {
    for (const status of ALL_PAYMENT_STATUSES) {
      const owners = PAYMENT_STATUS_GROUPS.filter((group) =>
        (group.statuses as readonly string[]).includes(status)
      );
      expect(owners.map((g) => g.id), status).toHaveLength(1);
    }
  });

  it('groups the legacy aliases with the state they mean', () => {
    // These pairs are the same operational state written by different code paths.
    expect(bookingStatusGroupFor('pending')?.id).toBe('awaiting_approval');
    expect(bookingStatusGroupFor('pending_approval')?.id).toBe('awaiting_approval');
    expect(bookingStatusGroupFor('awaiting_payment')?.id).toBe('awaiting_payment');
    expect(bookingStatusGroupFor('pending_payment')?.id).toBe('awaiting_payment');
    expect(bookingStatusGroupFor('payment_started')?.id).toBe('awaiting_payment');
    expect(bookingStatusGroupFor('slot_locked')?.id).toBe('holding');
    expect(paymentStatusGroupFor('success')?.id).toBe('paid');
    expect(paymentStatusGroupFor('paid')?.id).toBe('paid');
  });

  it('counts a rescheduled session as still confirmed', () => {
    // It is paid and on the calendar; an operator filtering "Confirmed" expects it.
    expect(bookingStatusGroupFor('rescheduled')?.id).toBe('confirmed');
  });

  it('returns null rather than guessing for an unknown or missing status', () => {
    expect(bookingStatusGroupFor('teleported')).toBeNull();
    expect(bookingStatusGroupFor(undefined)).toBeNull();
    expect(bookingStatusGroupFor('')).toBeNull();
    expect(paymentStatusGroupFor('half_paid')).toBeNull();
  });

  it('describes what each group means to an operator', () => {
    for (const group of BOOKING_STATUS_GROUPS) {
      expect(group.meaning.length, group.id).toBeGreaterThan(10);
      expect(group.statuses.length, group.id).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

/** Unwraps a plan, failing the test with the refusal message if there isn't one. */
function plan(request: Parameters<typeof planAdminBookingList>[0]) {
  const result = planAdminBookingList(request);
  if (!result.ok) throw new Error(`expected a plan, got ${result.code}: ${result.message}`);
  return result.plan;
}

describe('planAdminBookingList', () => {
  it('orders newest first and breaks ties by document id', () => {
    const p = plan({});
    expect(p.where).toEqual([]);
    expect(p.orderBy).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: '__name__', direction: 'desc' },
    ]);
    expect(p.index).toBeNull();
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('asks for one row more than the page so it can report there is a next page', () => {
    // Cheaper than a count(): one extra document read per page turn instead of a
    // second aggregation query.
    expect(plan({ pageSize: 25 }).limit).toBe(26);
    expect(plan({ pageSize: 1 }).limit).toBe(2);
  });

  it('uses == for a one-status group and in for a multi-status group', () => {
    expect(plan({ statusGroup: 'completed' }).where).toEqual([
      { field: 'status', op: '==', value: 'completed' },
    ]);
    expect(plan({ statusGroup: 'closed' }).where).toEqual([
      { field: 'status', op: 'in', value: ['cancelled', 'rejected', 'expired', 'no_show'] },
    ]);
  });

  it('names the index each supported combination needs', () => {
    expect(plan({ statusGroup: 'confirmed' }).index).toBe('bookings(status,createdAt DESC)');
    expect(plan({ paymentGroup: 'paid' }).index).toBe('bookings(paymentStatus,createdAt DESC)');
    expect(plan({ date: '2026-09-03' }).index).toBe('bookings(date,createdAt DESC)');
    expect(plan({ date: '2026-09-03', statusGroup: 'confirmed' }).index).toBe(
      'bookings(date,status,createdAt DESC)'
    );
    expect(plan({ therapistId: 'th_1' }).index).toBe('bookings(therapistId,createdAt DESC)');
  });

  it('refuses a filter combination no index serves, and says which do', () => {
    // The alternative — querying one filter and dropping rows in memory — returns
    // short pages and lets an operator read "nothing here" as "nothing exists".
    const result = planAdminBookingList({ statusGroup: 'confirmed', paymentGroup: 'paid' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNSUPPORTED_FILTER_COMBINATION');
    expect(result.message).toContain('payment + status');
    expect(result.message).toContain('session date + status');
  });

  it('refuses three filters at once', () => {
    const result = planAdminBookingList({
      date: '2026-09-03',
      statusGroup: 'confirmed',
      therapistId: 'th_1',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a page size that is not a whole number in range', () => {
    for (const pageSize of [0, -1, 2.5, MAX_PAGE_SIZE + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = planAdminBookingList({ pageSize });
      expect(result.ok, String(pageSize)).toBe(false);
      if (!result.ok) expect(result.code).toBe('INVALID_PAGE_SIZE');
    }
    expect(planAdminBookingList({ pageSize: MAX_PAGE_SIZE }).ok).toBe(true);
  });

  it('rejects a malformed date before it reaches Firestore', () => {
    for (const date of ['3 Sep 2026', '2026-9-3', '', 'today']) {
      const result = planAdminBookingList({ date });
      expect(result.ok, date).toBe(false);
      if (!result.ok) expect(result.code).toBe('INVALID_DATE');
    }
  });

  it('rejects an unknown group id even though the type says otherwise', () => {
    // Query strings are strings; the route validates first, but a bad value must
    // not fall through to an unfiltered query that shows everything.
    const result = planAdminBookingList({
      statusGroup: 'not_a_group' as Parameters<typeof planAdminBookingList>[0]['statusGroup'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('not_a_group');
  });

  it('carries the cursor through untouched', () => {
    const cursor = { createdAtMs: 1_757_000_000_000, id: 'bk_20260903_ABCD1234' };
    expect(plan({ cursor }).startAfter).toEqual(cursor);
    expect(plan({}).startAfter).toBeNull();
  });
});

describe('filter combinations offered to the UI', () => {
  it('agrees with the planner about what is supported', () => {
    // One source of truth: the filter bar disables what the planner would refuse.
    const fields: AdminBookingFilterField[] = ['status', 'paymentStatus', 'therapistId', 'date'];
    for (const a of fields) {
      for (const b of fields) {
        if (a === b) continue;
        const supported = isSupportedFilterCombination([a, b]);
        const offered = allowedAdditionalFilters([a]).includes(b);
        expect(offered, `${a} + ${b}`).toBe(supported);
      }
    }
  });

  it('offers every single filter on an empty selection', () => {
    expect([...allowedAdditionalFilters([])].sort()).toEqual([
      'date',
      'paymentStatus',
      'status',
      'therapistId',
    ]);
  });

  it('narrows the offer as filters are chosen', () => {
    expect(allowedAdditionalFilters(['status'])).toEqual(['date']);
    expect([...allowedAdditionalFilters(['date'])].sort()).toEqual(['status', 'therapistId']);
    expect(allowedAdditionalFilters(['paymentStatus'])).toEqual([]);
    expect(allowedAdditionalFilters(['date', 'status'])).toEqual([]);
  });

  it('never offers a filter that is already active', () => {
    expect(allowedAdditionalFilters(['date'])).not.toContain('date');
  });
});

/* ------------------------------------------------------------------ *
 * Cursor
 * ------------------------------------------------------------------ */

describe('pagination cursor', () => {
  it('round-trips', () => {
    const cursor = { createdAtMs: 1_757_000_000_123, id: 'bk_20260903_ABCD1234' };
    expect(decodeBookingCursor(encodeBookingCursor(cursor))).toEqual(cursor);
  });

  it('keeps the document id so a page boundary cannot straddle two rows', () => {
    // Two bookings written in the same millisecond: a createdAt-only cursor would
    // either repeat one or skip one, and a skipped booking is invisible.
    const a = { createdAtMs: 1_757_000_000_000, id: 'bk_a' };
    const b = { createdAtMs: 1_757_000_000_000, id: 'bk_b' };
    expect(encodeBookingCursor(a)).not.toBe(encodeBookingCursor(b));
    expect(decodeBookingCursor(encodeBookingCursor(b))?.id).toBe('bk_b');
  });

  it('rejects anything it did not produce instead of restarting from page one', () => {
    for (const raw of [
      '',
      null,
      undefined,
      'abc',
      'abc.bk_1',
      '.bk_1',
      '-1.bk_1',
      '1.7e12.bk_1',
      '1757000000000.',
      '1757000000000.bk/1',
      '1757000000000.bk 1',
      `1757000000000.${'x'.repeat(201)}`,
    ]) {
      expect(decodeBookingCursor(raw), String(raw)).toBeNull();
    }
  });

  it('accepts a document id containing dots only as the id half', () => {
    // The split is on the FIRST dot, so an id may itself be dotted — but the
    // pattern excludes dots, so such a cursor is refused rather than mis-parsed.
    expect(decodeBookingCursor('1757000000000.bk.1')).toBeNull();
  });

  it('builds a continuation cursor from the last row on the page', () => {
    const row = toAdminBookingRow({ id: 'bk_1', createdAt: '2026-09-03T04:05:06.789Z' });
    expect(cursorForRow(row)).toEqual({
      createdAtMs: Date.parse('2026-09-03T04:05:06.789Z'),
      id: 'bk_1',
    });
  });

  it('refuses to build a cursor from a row with no creation time', () => {
    // Such a row cannot appear in a createdAt-ordered query anyway; returning null
    // makes the route hide the next-page button rather than emit a broken link.
    expect(cursorForRow(toAdminBookingRow({ id: 'bk_1' }))).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Row projection
 * ------------------------------------------------------------------ */

const FULL_DOCUMENT = {
  id: 'bk_20260903_ABCD1234',
  status: 'confirmed',
  paymentStatus: 'paid',
  name: 'Ananya Sharma',
  email: 'ananya@example.com',
  phone: '+91 98765 43210',
  therapistId: 'th_priya',
  date: '2026-09-10',
  time: '09:00',
  sessionType: 'Individual therapy',
  sessionMode: 'online',
  paymentAmount: 1500,
  paymentCurrency: 'INR',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  calendarStatus: 'CREATED',
  refundStatus: undefined,
  rescheduleHistory: [{ previousDate: '2026-09-08' }, { previousDate: '2026-09-09' }],
  createdAt: '2026-09-01T10:15:00.000Z',
};

describe('toAdminBookingRow', () => {
  it('carries what the table shows', () => {
    const row = toAdminBookingRow(FULL_DOCUMENT);
    expect(row).toMatchObject({
      id: 'bk_20260903_ABCD1234',
      status: 'confirmed',
      statusGroup: 'confirmed',
      paymentStatus: 'paid',
      paymentGroup: 'paid',
      clientName: 'Ananya Sharma',
      clientEmail: 'ananya@example.com',
      clientPhone: '+91 98765 43210',
      therapistId: 'th_priya',
      date: '2026-09-10',
      time: '09:00',
      amountRupees: 1500,
      currency: 'INR',
      calendarStatus: 'CREATED',
      rescheduleCount: 2,
      createdAtIso: '2026-09-01T10:15:00.000Z',
    });
  });

  it('reports that a Meet link exists without sending the link', () => {
    // A list response covers many clients at once. The joinable URL belongs to the
    // detail view, where the operator has named one booking.
    const row = toAdminBookingRow(FULL_DOCUMENT);
    expect(row.hasMeetingLink).toBe(true);
    expect(JSON.stringify(row)).not.toContain('meet.google.com');
  });

  it('leaves the detail-only fields out of the projection entirely', () => {
    const row = toAdminBookingRow({
      ...FULL_DOCUMENT,
      // Fields a booking document really carries, none of which the list shows.
      ...({
        message: 'I have been feeling anxious about work',
        razorpayPaymentId: 'pay_SECRET',
        razorpayOrderId: 'order_SECRET',
        bookingToken: 'tok_SECRET',
        declineCustomNote: 'internal note',
        age: 24,
        gender: 'female',
        userId: 'uid_ananya',
      } as Record<string, unknown>),
    });
    const keys = Object.keys(row);
    for (const forbidden of [
      'message',
      'razorpayPaymentId',
      'razorpayOrderId',
      'bookingToken',
      'declineCustomNote',
      'meetingUrl',
      'age',
      'gender',
      'userId',
      'rescheduleHistory',
    ]) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('anxious');
    expect(serialized).not.toContain('SECRET');
  });

  it('prints nothing rather than a wrong number for absent values', () => {
    const row = toAdminBookingRow({ id: 'bk_bare' });
    expect(row.amountRupees).toBeNull();
    expect(row.currency).toBeNull();
    expect(row.createdAtIso).toBeNull();
    expect(row.hasMeetingLink).toBe(false);
    expect(row.rescheduleCount).toBe(0);
    expect(row.clientName).toBe('');
    // `pending` is the entity's own constructor default, not an invention here.
    expect(row.status).toBe('pending');
    expect(row.paymentStatus).toBeNull();
    expect(row.paymentGroup).toBeNull();
  });

  it('accepts every timestamp shape a booking document has held', () => {
    const iso = '2026-09-01T10:15:00.000Z';
    const ms = Date.parse(iso);
    const shapes: { label: string; value: unknown }[] = [
      { label: 'Firestore Timestamp', value: { toDate: () => new Date(ms) } },
      { label: 'serialized Timestamp', value: { seconds: ms / 1000, nanoseconds: 0 } },
      { label: 'underscore-serialized', value: { _seconds: ms / 1000 } },
      { label: 'Date', value: new Date(ms) },
      { label: 'ISO string', value: iso },
      { label: 'epoch millis', value: ms },
    ];
    for (const shape of shapes) {
      expect(toAdminBookingRow({ id: 'bk_1', createdAt: shape.value }).createdAtIso, shape.label).toBe(iso);
    }
  });

  it('turns an unusable timestamp into null instead of Invalid Date', () => {
    for (const value of [
      'not a date',
      Number.NaN,
      {},
      { toDate: () => new Date('nope') },
      {
        toDate: () => {
          throw new Error('detached snapshot');
        },
      },
      new Date('nope'),
      [],
    ]) {
      expect(toAdminBookingRow({ id: 'bk_1', createdAt: value }).createdAtIso).toBeNull();
    }
  });

  it('keeps a status it does not recognise, but groups it as nothing', () => {
    // Better a visible row labelled with the raw status than a hidden booking.
    const row = toAdminBookingRow({ id: 'bk_1', status: 'teleported' });
    expect(row.status).toBe('teleported');
    expect(row.statusGroup).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Lookup
 * ------------------------------------------------------------------ */

describe('classifyBookingLookup', () => {
  it('recognises the identifiers an operator pastes', () => {
    expect(classifyBookingLookup('bk_20260903_ABCD1234')).toEqual({
      kind: 'bookingId',
      values: ['bk_20260903_ABCD1234'],
    });
    expect(classifyBookingLookup('order_QqLmN0pRsT')).toEqual({
      kind: 'orderId',
      values: ['order_QqLmN0pRsT'],
    });
    expect(classifyBookingLookup('pay_XYZ789')).toEqual({
      kind: 'paymentId',
      values: ['pay_XYZ789'],
    });
  });

  it('lowercases an email because the create route stores it lowercased', () => {
    expect(classifyBookingLookup('  Ananya@Example.COM ')).toEqual({
      kind: 'email',
      values: ['ananya@example.com'],
    });
  });

  it('tries a phone number both as typed and as bare digits', () => {
    // `bookingSchema.phone` only trims, so the stored value is whatever the client
    // typed. Neither form is authoritative, so both are queried.
    expect(classifyBookingLookup('+91 98765-43210')).toEqual({
      kind: 'phone',
      values: ['+91 98765-43210', '+919876543210'],
    });
  });

  it('does not query the same phone value twice', () => {
    expect(classifyBookingLookup('9876543210')).toEqual({
      kind: 'phone',
      values: ['9876543210'],
    });
  });

  it('falls back to a name prefix', () => {
    expect(classifyBookingLookup('Ananya')).toEqual({ kind: 'namePrefix', values: ['Ananya'] });
    // A name is not mistaken for a phone number and vice versa.
    expect(classifyBookingLookup('Ananya 98765')?.kind).toBe('namePrefix');
  });

  it('treats an empty or whitespace-only term as no search at all', () => {
    expect(classifyBookingLookup('')).toBeNull();
    expect(classifyBookingLookup('   ')).toBeNull();
  });

  it('is case-insensitive about the id prefixes themselves', () => {
    expect(classifyBookingLookup('BK_20260903_ABCD1234')?.kind).toBe('bookingId');
    expect(classifyBookingLookup('Order_Qq')?.kind).toBe('orderId');
  });

  it('explains every lookup kind, including what it will miss', () => {
    const kinds: BookingLookupKind[] = [
      'bookingId',
      'orderId',
      'paymentId',
      'email',
      'phone',
      'namePrefix',
    ];
    for (const kind of kinds) {
      const text = describeBookingLookup({ kind, values: ['x'] });
      expect(text.length, kind).toBeGreaterThan(10);
    }
    // The two lossy ones must say so, because "no results" would otherwise read as
    // "no such client".
    expect(describeBookingLookup({ kind: 'phone', values: ['x'] })).toContain('not');
    expect(describeBookingLookup({ kind: 'namePrefix', values: ['x'] })).toContain('Case-sensitive');
  });
});





