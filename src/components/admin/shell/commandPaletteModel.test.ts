import { describe, expect, it } from 'vitest';
import { describeLookup, istDateString, paletteResults } from './commandPaletteModel';

const NOW = new Date('2026-10-27T20:00:00Z'); // 28 Oct, 01:30 IST

describe('paletteResults', () => {
  it('lists views, actions and every section when nothing is typed', () => {
    const results = paletteResults('', NOW);
    expect(results.some((entry) => entry.group === 'search')).toBe(false);
    expect(results.filter((entry) => entry.group === 'sections').length).toBeGreaterThan(10);
  });

  it("dates today's view in India, not UTC", () => {
    const today = paletteResults('', NOW).find((entry) => entry.id === 'view-today');
    expect(today?.href).toBe('/admin/bookings?date=2026-10-28');
    expect(istDateString(NOW)).toBe('2026-10-28');
  });

  it('opens a full booking id directly', () => {
    const [first] = paletteResults('bk_20260902_ABCD1234', NOW);
    expect(first.href).toBe('/admin/bookings/bk_20260902_ABCD1234');
  });

  it('puts an email lookup first and encodes it', () => {
    const [first] = paletteResults('a+b@example.com', NOW);
    expect(first.group).toBe('search');
    expect(first.href).toBe('/admin/bookings?q=a%2Bb%40example.com');
  });

  it('puts matching pages before a name search for a plain word', () => {
    const results = paletteResults('refunds', NOW);
    expect(results[0].group).not.toBe('search');
    expect(results.at(-1)?.group).toBe('search');
    expect(results.some((entry) => entry.href === '/admin/refunds')).toBe(true);
  });

  it('matches every word, in any order', () => {
    const results = paletteResults('jobs run', NOW);
    expect(results.some((entry) => entry.id === 'act-jobs')).toBe(true);
  });
});

describe('describeLookup', () => {
  it('names the field the server will match', () => {
    expect(describeLookup('order_X')).toMatch(/order/i);
    expect(describeLookup('pay_X')).toMatch(/payment/i);
    expect(describeLookup('+91 98765 43210')).toMatch(/phone/i);
    expect(describeLookup('Priya')).toMatch(/name/i);
  });
});
