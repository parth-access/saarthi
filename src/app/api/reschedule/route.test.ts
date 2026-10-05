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
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn().mockReturnValue({ add: addMock }),
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
});
