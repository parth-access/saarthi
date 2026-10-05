import { describe, expect, it } from 'vitest';
import type { RefundQueueSummary } from '@/domains/admin/refundTriage';
import {
  describeOldestWait,
  describeOutstandingMoney,
  describeScanBound,
  formatPaise,
  refundAmountDisplay,
  tallyStandings,
} from './refundsPresentation';

/**
 * The refunds page's sentences about money.
 *
 * Two failures are being tested, and both are ways a correct number becomes a
 * wrong belief: a figure this console guessed being read as one Razorpay returned,
 * and a total that silently excluded the refunds it could not price.
 */

function summary(overrides: Partial<RefundQueueSummary> = {}): RefundQueueSummary {
  return {
    total: 0,
    outstanding: 0,
    byStanding: { queued: 0, overdue: 0, retrying: 0, blocked: 0, settled: 0, unrecognised: 0 },
    oldestOutstandingMinutes: null,
    estimatedOutstandingPaise: 0,
    unpriced: 0,
    needsAPerson: 0,
    ...overrides,
  };
}

describe('formatPaise', () => {
  it('reads paise as rupees, in the Indian grouping', () => {
    expect(formatPaise(75000)).toBe('₹750');
    expect(formatPaise(150000)).toBe('₹1,500');
    expect(formatPaise(0)).toBe('₹0');
  });

  it('shows paise only when there are paise', () => {
    expect(formatPaise(74975)).toBe('₹749.75');
    expect(formatPaise(1)).toBe('₹0.01');
  });
});

describe('refundAmountDisplay', () => {
  it('marks a gateway amount as the only certain figure on the page', () => {
    const display = refundAmountDisplay({ kind: 'settled', paise: 75000 });
    expect(display.text).toBe('₹750');
    expect(display.certain).toBe(true);
    expect(display.qualifier).toContain('actually moved');
  });

  it('never renders an estimate as a plain rupee figure', () => {
    const display = refundAmountDisplay({
      kind: 'estimated',
      paise: 75000,
      percent: 50,
      basisRupees: 1500,
    });
    expect(display.certain).toBe(false);
    expect(display.text.startsWith('≈')).toBe(true);
    // The basis is named, so the arithmetic can be checked rather than trusted.
    expect(display.qualifier).toContain('50%');
    expect(display.qualifier).toContain('₹1,500');
    expect(display.qualifier).toContain('captured');
  });

  it('shows a percentage rather than inventing rupees when there is no basis', () => {
    const display = refundAmountDisplay({ kind: 'percent_only', percent: 100 });
    expect(display.text).toBe('100% of the payment');
    expect(display.certain).toBe(false);
    expect(display.text).not.toContain('₹');
  });

  it('says the amount is not known rather than showing nothing', () => {
    const display = refundAmountDisplay({ kind: 'unknown' });
    expect(display.text).toBe('Not known');
    expect(display.certain).toBe(false);
  });
});

describe('describeOutstandingMoney', () => {
  it('says plainly when nothing is waiting, scoped to what was scanned', () => {
    expect(describeOutstandingMoney(summary())).toContain('what was scanned');
  });

  it('states the total as an estimate when every row could be priced', () => {
    const sentence = describeOutstandingMoney(
      summary({ outstanding: 2, estimatedOutstandingPaise: 225000 })
    );
    expect(sentence).toContain('≈ ₹2,250');
    expect(sentence).toContain('2 refunds');
    expect(sentence).toContain('estimate');
  });

  it('says the real total is higher when a row could not be priced', () => {
    // The failure this prevents: an operator copying ₹750 into a reconciliation
    // note when a second refund of unknown size is also owed.
    const sentence = describeOutstandingMoney(
      summary({ outstanding: 2, estimatedOutstandingPaise: 75000, unpriced: 1 })
    );
    expect(sentence).toContain('1 could not be priced');
    expect(sentence).toContain('higher than this');
  });

  it('refuses a figure at all when nothing in the queue could be priced', () => {
    const sentence = describeOutstandingMoney(summary({ outstanding: 3, unpriced: 3 }));
    expect(sentence).not.toContain('₹');
    expect(sentence).toContain('3 refunds owed');
    expect(sentence).toContain('cannot say how much');
  });
});

describe('describeOldestWait', () => {
  it('says nothing when nothing is waiting', () => {
    expect(describeOldestWait(summary())).toBeNull();
  });

  it('phrases the wait the way every other admin screen does', () => {
    expect(describeOldestWait(summary({ outstanding: 1, oldestOutstandingMinutes: 130 }))).toBe(
      'Longest wait: 2 hr 10 min.'
    );
  });

  it('admits when no row records a requested time, rather than reading as zero wait', () => {
    const sentence = describeOldestWait(summary({ outstanding: 2 }));
    expect(sentence).toContain('unknown');
  });
});

describe('describeScanBound', () => {
  it('says nothing when the scan did not fill', () => {
    expect(describeScanBound(false, 60)).toBeNull();
  });

  it('says a truncated list is arbitrary, not the oldest ones', () => {
    // Because `findRefundsNeedingProcessing` has no orderBy — the collection has
    // no composite index — reading the cap as "the oldest 60" would be wrong.
    const sentence = describeScanBound(true, 60);
    expect(sentence).toContain('arbitrary subset');
    expect(sentence).toContain('not the oldest 60');
  });
});

describe('tallyStandings', () => {
  it('puts what will never resolve on its own first, and drops empty groups', () => {
    const tally = tallyStandings(
      summary({
        byStanding: { queued: 2, overdue: 1, retrying: 0, blocked: 1, settled: 0, unrecognised: 0 },
      })
    );
    expect(tally.map((entry) => entry.kind)).toEqual(['blocked', 'overdue', 'queued']);
    expect(tally[0]).toMatchObject({ count: 1, tone: 'danger', label: 'cannot succeed' });
  });

  it('returns nothing for an empty queue', () => {
    expect(tallyStandings(summary())).toEqual([]);
  });
});
