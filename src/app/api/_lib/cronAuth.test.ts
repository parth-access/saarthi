import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyCronAuth } from './cronAuth';
import { logger } from '@/app/api/_lib/logger';

describe('verifyCronAuth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 500 if CRON_SECRET is missing from environment', async () => {
    delete process.env.CRON_SECRET;
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const req = new Request('http://localhost:3000/api/cron/process-outbox', {
      headers: { Authorization: 'Bearer some_secret' }
    });

    const result = verifyCronAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response).toBeDefined();
    expect(result.response!.status).toBe(500);

    const body = await result.response!.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('CRON_SECRET is not configured');
    expect(loggerSpy).toHaveBeenCalled();
  });

  it('returns 500 if CRON_SECRET is empty or whitespace only', async () => {
    process.env.CRON_SECRET = '   ';
    const req = new Request('http://localhost:3000/api/cron/process-outbox', {
      headers: { Authorization: 'Bearer test' }
    });

    const result = verifyCronAuth(req);
    expect(result.authorized).toBe(false);
    expect(result.response!.status).toBe(500);
  });

  it('returns 401 if Authorization header is missing', async () => {
    process.env.CRON_SECRET = 'super_secret_cron_key_123';

    const req = new Request('http://localhost:3000/api/cron/session-reminders');
    const result = verifyCronAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.response).toBeDefined();
    expect(result.response!.status).toBe(401);

    const body = await result.response!.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing Authorization header');
    // Ensure secret is not leaked in body
    expect(JSON.stringify(body)).not.toContain('super_secret_cron_key_123');
  });

  it('returns 401 if Authorization header format is not Bearer', async () => {
    process.env.CRON_SECRET = 'super_secret_cron_key_123';

    const req = new Request('http://localhost:3000/api/cron/session-completion', {
      headers: { Authorization: 'Basic super_secret_cron_key_123' }
    });
    const result = verifyCronAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.response!.status).toBe(401);
  });

  it('returns 401 if token length differs from expected secret', async () => {
    process.env.CRON_SECRET = 'super_secret_cron_key_123';

    const req = new Request('http://localhost:3000/api/cron/process-outbox', {
      headers: { Authorization: 'Bearer short' }
    });
    const result = verifyCronAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.response!.status).toBe(401);
  });

  it('returns 401 if token has same length but incorrect value', async () => {
    process.env.CRON_SECRET = 'super_secret_cron_key_123';

    const req = new Request('http://localhost:3000/api/cron/process-outbox', {
      headers: { Authorization: 'Bearer super_secret_cron_key_999' }
    });
    const result = verifyCronAuth(req);

    expect(result.authorized).toBe(false);
    expect(result.response!.status).toBe(401);
  });

  it('returns authorized = true when exact valid Bearer token is provided', () => {
    process.env.CRON_SECRET = 'super_secret_cron_key_123';

    const req = new Request('http://localhost:3000/api/cron/process-outbox', {
      headers: { Authorization: 'Bearer super_secret_cron_key_123' }
    });
    const result = verifyCronAuth(req);

    expect(result.authorized).toBe(true);
    expect(result.response).toBeUndefined();
  });

  it('handles lowercase authorization header safely', () => {
    process.env.CRON_SECRET = 'super_secret_cron_key_123';

    const headers = new Headers();
    headers.set('authorization', 'Bearer super_secret_cron_key_123');

    const req = new Request('http://localhost:3000/api/cron/process-outbox', {
      headers
    });
    const result = verifyCronAuth(req);

    expect(result.authorized).toBe(true);
  });
});
