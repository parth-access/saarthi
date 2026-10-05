import { describe, it, expect } from 'vitest';
import {
  formatTime12h,
  slotTone,
  composePhone,
  SESSION_PRICE_DISPLAY,
  CONFIRM_CTA_LABEL,
  DEFAULT_DIAL_CODE,
  DIAL_CODES,
  STEP_LABELS,
} from './bookingUi';

describe('formatTime12h', () => {
  it('formats morning and afternoon 24h times to 12h with zero-padded minutes', () => {
    expect(formatTime12h('09:00')).toBe('9:00 AM');
    expect(formatTime12h('09:05')).toBe('9:05 AM');
    expect(formatTime12h('13:30')).toBe('1:30 PM');
    expect(formatTime12h('23:45')).toBe('11:45 PM');
  });

  it('maps midnight and noon to the 12h clock', () => {
    expect(formatTime12h('00:00')).toBe('12:00 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
  });

  it('returns the input unchanged when empty or unparseable (never "NaN:NaN")', () => {
    expect(formatTime12h('')).toBe('');
    expect(formatTime12h('not-a-time')).toBe('not-a-time');
  });
});

describe('slotTone', () => {
  it('is "available" whenever the slot is available, regardless of reason', () => {
    expect(slotTone(null, true)).toBe('available');
  });

  it('maps each server reason string to its tone', () => {
    expect(slotTone('Past', false)).toBe('past');
    expect(slotTone('Locked', false)).toBe('locked');
    expect(slotTone('Too far', false)).toBe('beyond');
    expect(slotTone('Booked', false)).toBe('booked');
  });

  it('treats an unknown unavailable reason as a generic booked/unavailable tone', () => {
    expect(slotTone('Something else', false)).toBe('booked');
    expect(slotTone(null, false)).toBe('booked');
  });
});

describe('composePhone', () => {
  it('joins dial code and national number with a single space', () => {
    expect(composePhone('+91', '9876543210')).toBe('+91 9876543210');
  });

  it('trims the national part', () => {
    expect(composePhone('+1', '  5551234567 ')).toBe('+1 5551234567');
  });

  it('returns "" when the national part is blank, so the required-phone rule still fires', () => {
    expect(composePhone('+91', '')).toBe('');
    expect(composePhone('+91', '   ')).toBe('');
  });

  it('a composed India number stays within the client regex max length (<= 20)', () => {
    expect(composePhone(DEFAULT_DIAL_CODE, '9876543210').length).toBeLessThanOrEqual(20);
  });
});

describe('booking display constants', () => {
  it('exposes a single price source that the CTA reuses', () => {
    expect(SESSION_PRICE_DISPLAY).toBe('₹1,500');
    expect(CONFIRM_CTA_LABEL).toContain(SESSION_PRICE_DISPLAY);
  });

  it('defaults the dial code to +91 and includes it in the list', () => {
    expect(DEFAULT_DIAL_CODE).toBe('+91');
    expect(DIAL_CODES.some((d) => d.code === DEFAULT_DIAL_CODE)).toBe(true);
  });

  it('labels all six selection steps', () => {
    expect(STEP_LABELS).toHaveLength(6);
  });
});
