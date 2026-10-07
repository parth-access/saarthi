import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  syncSessionCookie,
  invalidateSessionSync,
  resetSessionSyncForTests,
  SyncableFirebaseUser,
} from './sessionSyncService';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeUser(uid: string): SyncableFirebaseUser {
  return {
    uid,
    email: `${uid}@example.com`,
    getIdToken: vi.fn().mockResolvedValue(`id-token-${uid}`),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetSessionSyncForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('syncSessionCookie', () => {
  it('POSTs the ID token and resolves ok on success', async () => {
    const user = makeUser('u1');

    const result = await syncSessionCookie(user);

    expect(result).toMatchObject({ ok: true, status: 200, refusedMessage: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'id-token-u1' }),
    });
  });

  it('dedupes concurrent syncs for the same uid into one request', async () => {
    const user = makeUser('u1');
    fetchMock.mockImplementation(() => new Promise((r) => setTimeout(() => r({ ok: true, status: 200 }), 100)));

    const p1 = syncSessionCookie(user);
    const p2 = syncSessionCookie(user);

    await vi.advanceTimersByTimeAsync(150);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('reconfirms the cookie after a previous success, since middleware may have cleared it', async () => {
    const user = makeUser('u1');

    await syncSessionCookie(user);
    const second = await syncSessionCookie(user);

    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on network failure then succeeds', async () => {
    const user = makeUser('u1');
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry 4xx responses', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toMatchObject({ ok: false, status: 400, refusedMessage: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the server\u2019s refusal sentence verbatim on a terminal 403', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'This account has been disabled. Contact the practice if you believe this is a mistake.',
      }),
    });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toEqual({
      ok: false,
      status: 403,
      refusedMessage:
        'This account has been disabled. Contact the practice if you believe this is a mistake.',
    });
    // Terminal: no retries burned on an answer that will not change.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers a 4xx without a readable body with a null refusal, not a crash', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('no body');
      },
    });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toMatchObject({ ok: false, status: 400, refusedMessage: null });
  });

  it('never carries a refusal message from a 5xx, which may yet succeed on retry', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'upstream exploded' }),
    });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toMatchObject({ ok: false, refusedMessage: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries 5xx responses up to the retry budget', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result.ok).toBe(false);
    // Initial attempt + 2 retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops retrying when the user is invalidated (logout / switch)', async () => {
    const user = makeUser('u1');
    fetchMock.mockRejectedValue(new Error('offline'));

    const promise = syncSessionCookie(user);
    // Advance into the first retry backoff (attempt 0 failed at t=0, backoff
    // ends at t=800) and invalidate before the retry can fire.
    await vi.advanceTimersByTimeAsync(500);
    invalidateSessionSync();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toMatchObject({ ok: false, status: null, refusedMessage: null });
    // Only the first attempt went out; the invalidation cancelled the rest.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('invalidates a different user\u2019s in-flight sync when a new user syncs', async () => {
    const userA = makeUser('a');
    const userB = makeUser('b');
    fetchMock.mockImplementation(() => new Promise((r) => setTimeout(() => r({ ok: true, status: 200 }), 100)));

    const promiseA = syncSessionCookie(userA);
    // B starts before A's first attempt resolves.
    await vi.advanceTimersByTimeAsync(50);
    const promiseB = syncSessionCookie(userB);
    await vi.advanceTimersByTimeAsync(200);

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);
    expect(resultA.ok).toBe(false); // A superseded by B
    expect(resultB.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
