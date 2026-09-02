import { describe, it, expect } from 'vitest';
import {
  parseAgeInput,
  isValidClientAge,
  parseValidClientAge,
  AGE_RANGE_MESSAGE,
} from './age';
import { MAX_CLIENT_AGE, MIN_CLIENT_AGE } from '@/shared/constants';

describe('parseAgeInput', () => {
  it('accepts a plain integer, as a number or a digits-only string', () => {
    expect(parseAgeInput(18)).toBe(18);
    expect(parseAgeInput('18')).toBe(18);
    expect(parseAgeInput(' 18 ')).toBe(18);
    expect(parseAgeInput('018')).toBe(18);
  });

  it('refuses everything parseInt would silently accept', () => {
    // These are the exact inputs that made the old `parseInt(v, 10) > 0` rule
    // produce a confident wrong number: parseInt('18abc') === 18, and
    // parseInt('1e3') === 1 — which is one plausible origin of a stored `1`.
    expect(parseAgeInput('18abc')).toBeNull();
    expect(parseAgeInput('1e3')).toBeNull();
    expect(parseAgeInput('18.5')).toBeNull();
    expect(parseAgeInput('+18')).toBeNull();
    expect(parseAgeInput('-18')).toBeNull();
    expect(parseAgeInput('18 years')).toBeNull();
  });

  it('refuses non-integers and non-values', () => {
    expect(parseAgeInput(18.5)).toBeNull();
    expect(parseAgeInput(NaN)).toBeNull();
    expect(parseAgeInput(Infinity)).toBeNull();
    expect(parseAgeInput('')).toBeNull();
    expect(parseAgeInput('   ')).toBeNull();
    expect(parseAgeInput(undefined)).toBeNull();
    expect(parseAgeInput(null)).toBeNull();
    expect(parseAgeInput({})).toBeNull();
    expect(parseAgeInput(true)).toBeNull();
  });

  it('parses an out-of-range value rather than dropping it', () => {
    // Read paths need the real stored value so a legacy `1` stays visible as a
    // data problem instead of silently rendering as absent.
    expect(parseAgeInput(1)).toBe(1);
    expect(parseAgeInput(0)).toBe(0);
    expect(parseAgeInput('999')).toBe(999);
  });
});

describe('isValidClientAge', () => {
  it('accepts the inclusive bounds and rejects just outside them', () => {
    expect(isValidClientAge(MIN_CLIENT_AGE)).toBe(true);
    expect(isValidClientAge(MAX_CLIENT_AGE)).toBe(true);
    expect(isValidClientAge(MIN_CLIENT_AGE - 1)).toBe(false);
    expect(isValidClientAge(MAX_CLIENT_AGE + 1)).toBe(false);
  });

  it('rejects the values the reported bug produced', () => {
    expect(isValidClientAge(1)).toBe(false); // the reported "1Y"
    expect(isValidClientAge(0)).toBe(false); // mapBooking's old `|| 0`
    expect(isValidClientAge(NaN)).toBe(false);
    expect(isValidClientAge('18')).toBe(false); // must already be a number
  });
});

describe('parseValidClientAge', () => {
  it('returns a number only when the input is both parseable and in range', () => {
    expect(parseValidClientAge('18')).toBe(18);
    expect(parseValidClientAge(18)).toBe(18);
    expect(parseValidClientAge('1')).toBeNull();
    expect(parseValidClientAge('18abc')).toBeNull();
    expect(parseValidClientAge('')).toBeNull();
  });

  it('names both bounds in the shared message so client and server agree', () => {
    expect(AGE_RANGE_MESSAGE).toContain(String(MIN_CLIENT_AGE));
    expect(AGE_RANGE_MESSAGE).toContain(String(MAX_CLIENT_AGE));
  });
});
