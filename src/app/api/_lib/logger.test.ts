import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

/**
 * PII redaction regression tests: every structured payload reaching the API
 * logger (dev console AND production JSON) passes through the canonical
 * sanitizer, so tokens / emails / phones / payment identifiers never reach
 * log storage — even when a call site passes them by mistake.
 */
describe('API logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should serialize Error objects correctly in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const error = new Error('Test production error');

    logger.error(
      'SYSTEM',
      'Something failed',
      error,
      { test: true },
      'test-request-id'
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);

    const logString = consoleSpy.mock.calls[0][0];
    const logData = JSON.parse(logString);

    expect(logData.level).toBe('error');
    expect(logData.category).toBe('SYSTEM');
    expect(logData.message).toBe('Something failed');
    expect(logData.requestId).toBe('test-request-id');

    expect(logData.error).toEqual({
      name: 'Error',
      message: 'Test production error',
      stack: expect.any(String),
      cause: undefined,
    });

    expect(logData.error).not.toEqual({});
  });

  it('redacts sensitive keys from production JSON logs (tokens, emails, phones)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('MANAGE_BOOKING', 'Invalid token attempt', {
      token: 'a'.repeat(72),
      bookingToken: 'b'.repeat(72),
      email: 'victim@example.com',
      phone: '+91 98765 43210',
      bookingId: 'bk_1', // correlation id — must survive
    });

    const logData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logData.data.token).toBe('[FILTERED]');
    expect(logData.data.bookingToken).toBe('[FILTERED]');
    expect(logData.data.email).toBe('[FILTERED]');
    expect(logData.data.phone).toBe('[FILTERED]');
    expect(logData.data.bookingId).toBe('bk_1');
    expect(JSON.stringify(logData)).not.toContain('victim@example.com');
    expect(JSON.stringify(logData)).not.toContain('a'.repeat(72));
  });

  it('scrubs bearer tokens embedded in strings', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('AUTH', 'Auth header seen', {
      auth: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature', // caught by the key filter
      note: 'caller sent Bearer eyJhbGciOiJIUzI1NiJ9.other.signature', // caught by the string scrub
    });

    const printed = consoleSpy.mock.calls[0][0];
    expect(printed).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(printed).toContain('[FILTERED]');
    expect(printed).toContain('[FILTERED_TOKEN]');
  });

  it('redacts nested sensitive values (payment identifiers, deep objects)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('PAYMENT', 'Verify failed', new Error('boom'), {
      payment: { razorpay_payment_id: 'pay_SECRET', razorpay_order_id: 'order_SECRET', amount: 1500 },
      meta: { sessionNotes: 'contains disclosures', nested: { email: 'x@y.z' } },
    });

    const logData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logData.data.payment.razorpay_payment_id).toBe('[FILTERED]');
    expect(logData.data.payment.razorpay_order_id).toBe('[FILTERED]');
    expect(logData.data.payment.amount).toBe(1500);
    expect(logData.data.meta.nested.email).toBe('[FILTERED]');
  });

  it('redacts dev console output too (tokens must not reach terminal logs either)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('MANAGE_BOOKING', 'Invalid token attempt', { token: 'a'.repeat(72) });

    const printed = consoleSpy.mock.calls[0][0];
    expect(printed).not.toContain('a'.repeat(72));
    expect(printed).toContain('[FILTERED]');
  });
});
