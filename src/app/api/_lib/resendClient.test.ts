import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Resend client construction must never happen at import time: Next.js collects
 * page data for every route at build time, and a module-scope
 * `new Resend(process.env.RESEND_API_KEY)` crashes the build in any environment
 * where the key is not locally injected. These tests pin the contract:
 *   - importing/every route stays safe without RESEND_API_KEY;
 *   - using the client without a key raises a CLEAR configuration error at send
 *     time (never a silent drop);
 *   - with a key present, sending works.
 */

const sendMock = vi.fn().mockResolvedValue({ data: { id: 're_test' }, error: null });

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
});

describe('getResendClient', () => {
  it('throws a clear configuration error when used without RESEND_API_KEY', async () => {
    const { getResendClient } = await import('./resendClient');
    expect(() => getResendClient()).toThrowError('RESEND_API_KEY is not configured');
  });

  it('returns a working client and caches it when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getResendClient } = await import('./resendClient');
    const first = getResendClient();
    const second = getResendClient();
    expect(first).toBe(second); // cached — one client per process
    await first.emails.send({ from: 'a@b.c', to: 'd@e.f', subject: 'x', html: 'y' });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
