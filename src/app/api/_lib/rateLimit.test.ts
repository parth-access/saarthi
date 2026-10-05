import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkRateLimit, getClientIp } from './rateLimit';

describe('getClientIp', () => {
  it('uses the RIGHTMOST x-forwarded-for entry (the value the trusted edge appended)', () => {
    const req = new Request('http://localhost/x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 1.2.3.4, 10.0.0.9' },
    });
    // Leftmost values are client-spoofable; rotating them must not rotate the
    // rate-limit bucket.
    expect(getClientIp(req)).toBe('10.0.0.9');
  });

  it('falls back to x-real-ip, then unknown', () => {
    expect(getClientIp(new Request('http://localhost/x', { headers: { 'x-real-ip': '10.1.1.1' } }))).toBe('10.1.1.1');
    expect(getClientIp(new Request('http://localhost/x'))).toBe('unknown');
  });
});

describe('checkRateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces the burst limit within the window, then resets after it', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    const key = `test_${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit('1.2.3.4', key, 3, 60_000).success).toBe(true);
    }
    expect(checkRateLimit('1.2.3.4', key, 3, 60_000).success).toBe(false);

    vi.setSystemTime(start + 61_000);
    expect(checkRateLimit('1.2.3.4', key, 3, 60_000).success).toBe(true);
  });

  it('buckets per route+ip combination', () => {
    const key = `test_${Math.random()}`;
    expect(checkRateLimit('9.9.9.9', key, 1, 60_000).success).toBe(true);
    expect(checkRateLimit('9.9.9.9', key, 1, 60_000).success).toBe(false);
    // a different route bucket for the same ip is unaffected
    expect(checkRateLimit('9.9.9.9', `${key}_b`, 1, 60_000).success).toBe(true);
  });
});
