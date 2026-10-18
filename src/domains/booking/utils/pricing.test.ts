import { describe, it, expect } from 'vitest';
import { calculateBookingPrice, DEFAULT_IN_PERSON_PRICE, DEFAULT_ONLINE_PRICE } from './pricing';

describe('calculateBookingPrice', () => {
  it('uses platform defaults when the therapist has no prices', () => {
    expect(calculateBookingPrice('online')).toBe(DEFAULT_ONLINE_PRICE);
    expect(calculateBookingPrice('in_person')).toBe(DEFAULT_IN_PERSON_PRICE);
    expect(calculateBookingPrice(undefined, {})).toBe(DEFAULT_ONLINE_PRICE);
  });

  it("uses the therapist's own prices when set", () => {
    const t = { sessionPrice: 1800, inPersonPrice: 2500 };
    expect(calculateBookingPrice('online', t)).toBe(1800);
    expect(calculateBookingPrice('IN_PERSON', t)).toBe(2500);
  });

  it('ignores invalid stored prices', () => {
    for (const bad of [0, -5, 12.5, '1800', null, 1_000_000]) {
      expect(calculateBookingPrice('online', { sessionPrice: bad })).toBe(DEFAULT_ONLINE_PRICE);
    }
  });
});
