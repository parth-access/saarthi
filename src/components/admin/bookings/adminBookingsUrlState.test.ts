import { describe, it, expect } from 'vitest';
import {
  EMPTY_VIEW,
  activeFilterFields,
  adminBookingsApiQuery,
  describeActiveFilters,
  effectivePageSize,
  filterAvailability,
  isLookupView,
  parseAdminBookingsView,
  withCursor,
  withFilters,
  withoutFilter,
  type AdminBookingsView,
} from './adminBookingsUrlState';
import { allowedAdditionalFilters } from '@/domains/booking/queries/adminBookingQuery';

/**
 * The bookings screen has no component tests — this project has no DOM test
 * environment — so every rule that could mislead an operator lives in this
 * module and is asserted here.
 *
 * The three that matter most:
 *
 *  - a cleared control must be *absent* from the query, not a filter on `''`;
 *  - a filter change must drop the page cursor, because a cursor from a
 *    different ordering skips rows invisibly;
 *  - a search must not appear to combine with filters, because the API cannot
 *    combine them.
 */

function view(overrides: Partial<AdminBookingsView> = {}): AdminBookingsView {
  return { ...EMPTY_VIEW, ...overrides };
}

function parse(query: string) {
  return parseAdminBookingsView(new URLSearchParams(query));
}

describe('reading a link', () => {
  it('reads a full filtered view', () => {
    const { view: parsed, ignored } = parse(
      'status=confirmed&payment=paid&therapistId=th_priya&date=2026-09-10&pageSize=50&cursor=1757000000000.bk_1'
    );
    expect(ignored).toEqual([]);
    expect(parsed).toEqual({
      statusGroup: 'confirmed',
      paymentGroup: 'paid',
      therapistId: 'th_priya',
      date: '2026-09-10',
      term: null,
      cursor: '1757000000000.bk_1',
      pageSize: 50,
    });
  });

  it('treats a blank parameter as absent, not as a filter on the empty string', () => {
    // `?therapistId=` is what a cleared select posts. Filtering on '' would match
    // nothing and read as "this therapist has no bookings".
    const { view: parsed, ignored } = parse('status=&payment=&therapistId=&date=&q=&cursor=&pageSize=');
    expect(parsed).toEqual(EMPTY_VIEW);
    expect(ignored).toEqual([]);
  });

  it('treats a whitespace-only search as absent', () => {
    expect(parse('q=%20%20%20').view.term).toBeNull();
    expect(isLookupView(parse('q=%20%20%20').view)).toBe(false);
  });

  it('trims a search term rather than searching for the spaces', () => {
    expect(parse('q=%20bk_1%20').view.term).toBe('bk_1');
  });

  it('names a filter it does not recognise instead of dropping it silently', () => {
    // The dangerous version of this returns the unfiltered list, which looks
    // exactly like a legitimate answer.
    const { view: parsed, ignored } = parse('status=teleported&payment=half');
    expect(parsed.statusGroup).toBeNull();
    expect(parsed.paymentGroup).toBeNull();
    expect(ignored).toEqual(['status', 'payment']);
  });

  it('refuses a date that is not a real calendar day', () => {
    for (const bad of ['3-9-2026', '2026-9-3', '2026-02-31', 'yesterday', '2026-13-01']) {
      const { view: parsed, ignored } = parse(`date=${encodeURIComponent(bad)}`);
      expect(parsed.date, bad).toBeNull();
      expect(ignored, bad).toEqual(['date']);
    }
  });

  it('accepts a leap day that exists and rejects one that does not', () => {
    expect(parse('date=2028-02-29').view.date).toBe('2028-02-29');
    expect(parse('date=2026-02-29').view.date).toBeNull();
  });

  it('refuses a page size outside the range the API accepts', () => {
    for (const bad of ['0', '101', '-5', '2.5', 'abc', 'Infinity']) {
      const { view: parsed, ignored } = parse(`pageSize=${bad}`);
      expect(parsed.pageSize, bad).toBeNull();
      expect(ignored, bad).toEqual(['pageSize']);
    }
    expect(parse('pageSize=1').view.pageSize).toBe(1);
    expect(parse('pageSize=100').view.pageSize).toBe(100);
  });

  it('refuses a search term long enough to be a paste accident', () => {
    const { view: parsed, ignored } = parse(`q=${'a'.repeat(500)}`);
    expect(parsed.term).toBeNull();
    expect(ignored).toEqual(['q']);
  });

  it('leaves the page size unset when the link does not name one', () => {
    // So the default lives in the API, in one place, rather than being copied here.
    expect(parse('').view.pageSize).toBeNull();
    expect(effectivePageSize(parse('').view)).toBe(25);
    expect(effectivePageSize(parse('pageSize=10').view)).toBe(10);
  });
});

describe('what the API is asked for', () => {
  it('sends only the filters that are set', () => {
    expect(adminBookingsApiQuery(view({ statusGroup: 'awaiting_approval' }))).toBe(
      'status=awaiting_approval'
    );
    expect(adminBookingsApiQuery(EMPTY_VIEW)).toBe('');
  });

  it('sends a search alone, never alongside filters it cannot combine with', () => {
    // The API ignores filters during a lookup. Sending them would put a request
    // on the wire that claims to do something it does not.
    const q = adminBookingsApiQuery(
      view({ term: 'bk_1', statusGroup: 'closed', date: '2026-09-10', cursor: '1.bk_0' })
    );
    expect(q).toBe('q=bk_1');
  });

  it('round-trips a cursor without interpreting it', () => {
    expect(adminBookingsApiQuery(view({ cursor: '1757000000000.bk_1' }))).toBe(
      'cursor=1757000000000.bk_1'
    );
  });

  it('survives a round trip through the URL', () => {
    const original = view({
      statusGroup: 'closed',
      date: '2026-09-10',
      pageSize: 50,
      cursor: '1757000000000.bk_1',
    });
    expect(parse(adminBookingsApiQuery(original)).view).toEqual(original);
  });
});

describe('changing a filter', () => {
  it('drops the cursor, so a page from one query is never reused for another', () => {
    // The failure this prevents is silent: `startAfter(row)` in a different
    // ordering skips rows, and a skipped row is invisible in the UI.
    const paged = view({ statusGroup: 'confirmed', cursor: '1757000000000.bk_1' });
    expect(withFilters(paged, { statusGroup: 'closed' }).cursor).toBeNull();
    expect(withoutFilter(paged, 'status').cursor).toBeNull();
  });

  it('keeps the cursor only when nothing but the cursor changes', () => {
    const paged = view({ statusGroup: 'confirmed' });
    expect(withCursor(paged, '1757000000000.bk_1')).toEqual({
      ...paged,
      cursor: '1757000000000.bk_1',
    });
  });

  it('clears the filters when a search is typed', () => {
    const filtered = view({ statusGroup: 'confirmed', date: '2026-09-10', cursor: '1.bk_1' });
    const searched = withFilters(filtered, { term: 'ananya@example.com' });
    expect(searched).toEqual({ ...EMPTY_VIEW, term: 'ananya@example.com' });
  });

  it('restores an empty filter set when the search is cleared', () => {
    const searched = view({ term: 'bk_1' });
    expect(withFilters(searched, { term: null })).toEqual(EMPTY_VIEW);
  });

  it('clears exactly one filter and leaves the rest', () => {
    const both = view({ date: '2026-09-10', statusGroup: 'confirmed' });
    expect(withoutFilter(both, 'status')).toEqual(view({ date: '2026-09-10' }));
    expect(withoutFilter(both, 'date')).toEqual(view({ statusGroup: 'confirmed' }));
  });
});

describe('which filters the bar offers', () => {
  it('agrees with the query planner about every combination', () => {
    // One table decides what is indexed; if these two disagree the bar offers a
    // combination the API answers with a 400.
    const fields = ['status', 'paymentStatus', 'therapistId', 'date'] as const;
    for (const first of fields) {
      const single = filterAvailability(
        view(
          first === 'status'
            ? { statusGroup: 'confirmed' }
            : first === 'paymentStatus'
              ? { paymentGroup: 'paid' }
              : first === 'therapistId'
                ? { therapistId: 'th_priya' }
                : { date: '2026-09-10' }
        )
      );
      const allowed = new Set(allowedAdditionalFilters([first]));
      for (const second of fields) {
        if (second === first) continue;
        expect(single[second].enabled, `${first} + ${second}`).toBe(allowed.has(second));
      }
    }
  });

  it('offers everything when nothing is filtered', () => {
    const availability = filterAvailability(EMPTY_VIEW);
    for (const field of ['status', 'paymentStatus', 'therapistId', 'date'] as const) {
      expect(availability[field].enabled, field).toBe(true);
      expect(availability[field].reason, field).toBe('');
    }
  });

  it('keeps an applied filter enabled so it can always be cleared', () => {
    // Payment can be combined with nothing, so it would disable itself.
    const availability = filterAvailability(view({ paymentGroup: 'paid' }));
    expect(availability.paymentStatus.enabled).toBe(true);
    expect(availability.status.enabled).toBe(false);
    expect(availability.status.reason).toContain('Payment');
  });

  it('explains a refusal by naming the filter in the way', () => {
    const availability = filterAvailability(view({ statusGroup: 'confirmed' }));
    expect(availability.date.enabled).toBe(true);
    expect(availability.therapistId.enabled).toBe(false);
    expect(availability.therapistId.reason).toContain('Therapist');
    expect(availability.therapistId.reason).toContain('Status');
  });

  it('closes the filters during a search and says why', () => {
    const availability = filterAvailability(view({ term: 'bk_1' }));
    for (const field of ['status', 'paymentStatus', 'therapistId', 'date'] as const) {
      expect(availability[field].enabled, field).toBe(false);
      expect(availability[field].reason, field).toContain('Clear the search');
    }
  });

  it('reports no active filters during a search', () => {
    expect(activeFilterFields(view({ term: 'bk_1', statusGroup: 'confirmed' }))).toEqual([]);
    expect(activeFilterFields(view({ statusGroup: 'confirmed', date: '2026-09-10' }))).toEqual([
      'status',
      'date',
    ]);
  });
});

describe('describing what is applied', () => {
  it('lists one chip per active filter, using supplied labels', () => {
    const chips = describeActiveFilters(
      view({ statusGroup: 'closed', therapistId: 'th_priya', date: '2026-09-10' }),
      { status: 'Cancelled or closed', therapistName: 'Priya Nair', date: 'Thu, 10 Sep 2026' }
    );
    expect(chips).toEqual([
      { field: 'status', label: 'Status', value: 'Cancelled or closed' },
      { field: 'therapistId', label: 'Therapist', value: 'Priya Nair' },
      { field: 'date', label: 'Session date', value: 'Thu, 10 Sep 2026' },
    ]);
  });

  it('falls back to the raw id when a therapist is not in the roster', () => {
    // A booking pointing at a deleted therapist must still be explicable.
    const chips = describeActiveFilters(view({ therapistId: 'th_deleted' }));
    expect(chips).toEqual([{ field: 'therapistId', label: 'Therapist', value: 'th_deleted' }]);
  });

  it('shows no chips during a search', () => {
    expect(describeActiveFilters(view({ term: 'bk_1' }))).toEqual([]);
  });
});
