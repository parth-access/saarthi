import { describe, it, expect } from 'vitest';
import {
  formatPaidTotal,
  formatRefundTotal,
  describeUpcoming,
  identityNotes,
} from './clientsPresentation';
import type { ClientMoney, ClientIdentity } from '@/domains/admin/clientProfile';

function money(over: Partial<ClientMoney> = {}): ClientMoney {
  return { paidCount: 0, paidRupees: 0, unpricedPaidCount: 0, refundedCount: 0, refundedPaise: 0, ...over };
}

function identity(over: Partial<ClientIdentity> = {}): ClientIdentity {
  return { name: null, phone: null, nameVaried: false, phoneVaried: false, userIds: [], ...over };
}

describe('formatPaidTotal', () => {
  it('shows a plain total when every captured payment had an amount', () => {
    const result = formatPaidTotal(money({ paidCount: 2, paidRupees: 3000 }));
    expect(result.text).toBe('₹3,000');
    expect(result.isFloor).toBe(false);
    expect(result.caveat).toBeNull();
  });

  it('marks the total a lower bound when a captured payment carried no amount', () => {
    const result = formatPaidTotal(money({ paidCount: 3, paidRupees: 3000, unpricedPaidCount: 1 }));
    expect(result.text).toBe('≥ ₹3,000');
    expect(result.isFloor).toBe(true);
    expect(result.caveat).toContain('1 captured payment has no amount recorded');
  });
});

describe('formatRefundTotal', () => {
  it('converts stored paise to rupees', () => {
    expect(formatRefundTotal(money({ refundedCount: 1, refundedPaise: 150000 }))).toBe('₹1,500');
  });
});

describe('describeUpcoming', () => {
  it('says none when there are no future confirmed sessions', () => {
    expect(describeUpcoming({ count: 0, unplaceable: 0 })).toEqual({ text: 'None upcoming', note: null });
  });

  it('states undateable confirmed sessions separately rather than hiding them', () => {
    const result = describeUpcoming({ count: 2, unplaceable: 1 });
    expect(result.text).toBe('2 upcoming');
    expect(result.note).toContain('1 confirmed session could not be placed');
  });
});

describe('identityNotes', () => {
  it('is empty for a clean single identity', () => {
    expect(identityNotes(identity({ name: 'Asha', userIds: ['u1'] }))).toEqual([]);
  });

  it('surfaces divergent details and multiple linked accounts', () => {
    const notes = identityNotes(identity({ nameVaried: true, phoneVaried: true, userIds: ['u1', 'u2'] }));
    expect(notes).toHaveLength(3);
    expect(notes[2]).toContain('2 different accounts');
  });
});
