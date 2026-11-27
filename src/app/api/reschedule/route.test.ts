import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression guard for the build blocker: /api/reschedule used to instantiate
 * `new Resend(process.env.RESEND_API_KEY)` at module scope, which crashed
 * `next build` whenever the key was not locally injected. See reconnect/route.test.ts
 * for the full contract; this file pins the same behavior for this route.
 */

const sendMock = vi.fn().mockResolvedValue({ data: { id: 're_test' }, error: null });
const addMock = vi.fn().mockResolvedValue({ id: 'doc_1' });

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () { return { emails: { send: sendMock } }; }),
}));

// bookings/{id} reads; each test can swap in its own booking.
const OWN_BOOKING = { userId: 'user_1', email: 'user_1@example.com', therapistId: 'th_1' };
const bookings: Record<string, Record<string, unknown>> = {};
const bookingDocMock = vi.fn((id: string) => ({
  get: vi.fn().mockResolvedValue({ exists: id in bookings, data: () => bookings[id] }),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => (name === 'bookings' ? { doc: bookingDocMock } : { add: addMock })),
  },
}));

vi.mock('@/lib/auth/verifySession', () => ({
  verifySession: vi.fn(),
}));

import { verifySession } from '@/lib/auth/verifySession';

const CLAIMS = { uid: 'user_1', email: 'user_1@example.com', role: 'client' };

async function post(body: unknown) {
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/api/reschedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
  vi.mocked(verifySession).mockResolvedValue(CLAIMS);
  for (const id of Object.keys(bookings)) delete bookings[id];
  bookings.bk_1 = { ...OWN_BOOKING };
});

describe('POST /api/reschedule', () => {
  it('imports safely without RESEND_API_KEY (no module-scope Resend construction)', async () => {
    const mod = await import('./route');
    expect(typeof mod.POST).toBe('function');
  });

  it('persists the request and returns an explicit 500 configuration error when the key is missing', async () => {

    const res = await post({
      userId: 'user_1',
      bookingId: 'bk_1',
      therapistId: 'th_1',
      userName: 'Test User',
      userEmail: 'user_1@example.com',
      reason: 'Conflict',
    });

    expect(res.status).toBe(500);
    // The client gets an OPAQUE error (details go to server logs — no internal
    // configuration leakage); the send itself is never silently dropped.
    const body = await res.json();
    expect(body.error).toBe('Internal Server Error');
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends the admin email when RESEND_API_KEY is configured', async () => {
    process.env.RESEND_API_KEY = 're_test_key';

    const res = await post({
      userId: 'user_1',
      bookingId: 'bk_1',
      therapistId: 'th_1',
      userName: 'Test User',
      userEmail: 'user_1@example.com',
      reason: 'Conflict',
    });

    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe('admin@saarthilife.com');
  });

  it('rejects a caller whose uid does not match the payload userId', async () => {

    const res = await post({
      userId: 'someone_else',
      bookingId: 'bk_1',
      therapistId: 'th_1',
      userName: 'Test User',
      userEmail: 'user_1@example.com',
    });

    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('renders client-supplied values as text, never as HTML markup (injection guard)', async () => {
    process.env.RESEND_API_KEY = 're_test_key';

    const res = await post({
      userId: 'user_1',
      bookingId: 'bk_1',
      therapistId: 'th_1',
      userName: '<img src=x onerror=alert(1)>',
      userEmail: 'user_1@example.com',
      reason: '<script>alert(1)</script>',
    });

    expect(res.status).toBe(200);
    const html = String(sendMock.mock.calls[0][0].html);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  describe('therapistId comes from the booking, not the request body', () => {
    const body = {
      userId: 'user_1',
      bookingId: 'bk_1',
      userName: 'Test User',
      userEmail: 'user_1@example.com',
      reason: 'Conflict',
    };

    it('stores the booking’s therapist even when the body names another one', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      const res = await post({ ...body, therapistId: 'th_someone_else' });

      expect(res.status).toBe(200);
      expect(addMock.mock.calls[0][0].therapistId).toBe('th_1');
    });

    it('works when the body sends no therapistId at all', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      const res = await post(body);

      expect(res.status).toBe(200);
      expect(addMock.mock.calls[0][0].therapistId).toBe('th_1');
    });

    it('refuses a booking that belongs to someone else', async () => {
      bookings.bk_other = { userId: 'user_2', email: 'user_2@example.com', therapistId: 'th_2' };
      const res = await post({ ...body, bookingId: 'bk_other', therapistId: 'th_2' });

      expect(res.status).toBe(403);
      expect(addMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('refuses a booking that does not exist, with the same answer as not-yours', async () => {
      const res = await post({ ...body, bookingId: 'bk_missing' });

      expect(res.status).toBe(403);
      expect(addMock).not.toHaveBeenCalled();
    });

    it('accepts a guest booking owned through the session’s verified email', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      bookings.bk_guest = { userId: null, email: 'USER_1@example.com', therapistId: 'th_3' };
      const res = await post({ ...body, bookingId: 'bk_guest' });

      expect(res.status).toBe(200);
      expect(addMock.mock.calls[0][0].therapistId).toBe('th_3');
    });

    it('refuses a booking whose email matches only when the session has no verified email', async () => {
      vi.mocked(verifySession).mockResolvedValue({ uid: 'user_1', role: 'client' });
      bookings.bk_guest = { userId: null, email: 'user_1@example.com', therapistId: 'th_3' };
      const res = await post({ ...body, bookingId: 'bk_guest' });

      expect(res.status).toBe(403);
    });

    it('answers 409 when the booking has no therapist', async () => {
      bookings.bk_1 = { userId: 'user_1', email: 'user_1@example.com' };
      const res = await post(body);

      expect(res.status).toBe(409);
      expect(addMock).not.toHaveBeenCalled();
    });
  });
});
