import { describe, it, expect } from 'vitest';
import { sanitizeData, sanitizeSentryEvent } from './sanitize';
import type { ErrorEvent } from '@sentry/nextjs';

describe('Sentry Sanitization', () => {
  it('should scrub sensitive keys from objects', () => {
    const sensitiveObj = {
      user: 'test_user',
      password: 'secret_password_123',
      apiKey: 'api_key_secret',
      phone: '+1234567890',
      nested: {
        token: 'jwt.token.val',
        regular: 'data',
      },
    };

    const sanitized = sanitizeData(sensitiveObj) as Record<string, unknown>;

    expect(sanitized.user).toBe('test_user');
    expect(sanitized.password).toBe('[FILTERED]');
    expect(sanitized.apiKey).toBe('[FILTERED]');
    expect(sanitized.phone).toBe('[FILTERED]');
    expect((sanitized.nested as Record<string, unknown>).token).toBe('[FILTERED]');
    expect((sanitized.nested as Record<string, unknown>).regular).toBe('data');
  });

  it('should scrub auth headers and cookies from Sentry events', () => {
    const mockEvent: ErrorEvent = {
      type: undefined,
      event_id: 'test-event-123',
      request: {
        headers: {
          authorization: 'Bearer secret_token',
          cookie: 'session=12345',
          'content-type': 'application/json',
        },
        cookies: {
          session: '12345',
        },
        query_string: 'token=xyz&page=1',
      },
      user: {
        id: 'user_123',
        email: 'user@example.com',
        ip_address: '192.168.1.1',
      },
    };

    const sanitizedEvent = sanitizeSentryEvent(mockEvent);

    expect(sanitizedEvent.request?.headers?.authorization).toBeUndefined();
    expect(sanitizedEvent.request?.headers?.cookie).toBeUndefined();
    expect(sanitizedEvent.request?.headers?.['content-type']).toBe('application/json');
    expect(sanitizedEvent.request?.query_string).toBe('token=[FILTERED]&page=1');
    expect(sanitizedEvent.user?.id).toBe('user_123');
    expect(sanitizedEvent.user?.email).toBeUndefined();
    expect(sanitizedEvent.user?.ip_address).toBe('[FILTERED]');
  });
});
