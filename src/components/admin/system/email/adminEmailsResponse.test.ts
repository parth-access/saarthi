import { describe, it, expect } from 'vitest';
import {
  interpretAdminEmailsResponse,
  GENERIC_EMAILS_ERROR,
  EMAILS_SESSION_ERROR,
  EMAILS_BAD_BOOKING_ID,
} from './adminEmailsResponse';
import { interpretAdminEmailDetailResponse } from './adminEmailDetailResponse';

function okBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    success: true,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    bookingId: null,
    scanLimit: 100,
    emails: { ok: true, rows: [], atLeast: false },
    ...overrides,
  };
}

describe('interpretAdminEmailsResponse', () => {
  it('accepts a well-formed 200 payload', () => {
    const result = interpretAdminEmailsResponse(200, okBody());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.bookingId).toBeNull();
  });

  it('carries the booking-lookup mode through', () => {
    const result = interpretAdminEmailsResponse(200, okBody({ bookingId: 'bk_1' }));
    expect(result.ok && result.payload.bookingId).toBe('bk_1');
  });

  it('surfaces a 400 as the request fact it is', () => {
    const result = interpretAdminEmailsResponse(400, { error: EMAILS_BAD_BOOKING_ID });
    expect(result).toEqual({ ok: false, error: EMAILS_BAD_BOOKING_ID });
  });

  it('refuses malformed scans and non-200s', () => {
    expect(interpretAdminEmailsResponse(200, okBody({ emails: { ok: true, rows: 'x' } }))).toEqual({
      ok: false,
      error: GENERIC_EMAILS_ERROR,
    });
    expect(interpretAdminEmailsResponse(401, null)).toEqual({ ok: false, error: EMAILS_SESSION_ERROR });
    expect(interpretAdminEmailsResponse(500, { success: false })).toEqual({
      ok: false,
      error: GENERIC_EMAILS_ERROR,
    });
  });
});

describe('interpretAdminEmailDetailResponse', () => {
  it('reads the full detail including the plaintext backup', () => {
    const result = interpretAdminEmailDetailResponse(200, {
      success: true,
      email: {
        id: 'email_1',
        bookingId: 'bk_1',
        type: 'booking-confirmed',
        recipient: 'c@x.com',
        subject: 'S',
        status: 'failed',
        attemptCount: 2,
        lastError: 'boom',
        createdAtIso: null,
        updatedAtIso: null,
        text: 'plaintext body',
        attempts: [
          { attemptNumber: 1, attemptedAtIso: null, status: 'failed', error: 'boom', responseId: null },
          { attemptNumber: 2, attemptedAtIso: null, status: 'success', error: null, responseId: 're_1' },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email.text).toBe('plaintext body');
      expect(result.email.attempts).toHaveLength(2);
      expect(result.email.attempts[1]?.responseId).toBe('re_1');
    }
  });

  it('separates not-found from retryable errors', () => {
    const notFound = interpretAdminEmailDetailResponse(404, { error: 'No email log exists with that id.' });
    expect(notFound.ok).toBe(false);
    expect(notFound.ok ? null : notFound.kind).toBe('not-found');

    const error = interpretAdminEmailDetailResponse(500, { error: 'x' });
    expect(error.ok ? null : error.kind).toBe('error');
  });

  it('refuses a 200 without a real email record', () => {
    const result = interpretAdminEmailDetailResponse(200, { success: true, email: { nope: true } });
    expect(result.ok ? null : result.kind).toBe('error');
  });
});
