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
  it('POSTs the ID token and resolves true on success', async () => {
    const user = makeUser('u1');

    const result = await syncSessionCookie(user);

    expect(result).toBe(true);
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
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  it('skips a duplicate POST for the same user inside the dedupe window', async () => {
    const user = makeUser('u1');

    await syncSessionCookie(user);
    const second = await syncSessionCookie(user);

    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not dedupe after the window elapses', async () => {
    const user = makeUser('u1');

    await syncSessionCookie(user);
    vi.advanceTimersByTime(61_000);
    await syncSessionCookie(user);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on network failure then succeeds', async () => {
    const user = makeUser('u1');
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry 4xx responses', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx responses up to the retry budget', async () => {
    const user = makeUser('u1');
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const promise = syncSessionCookie(user);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toBe(false);
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

    expect(result).toBe(false);
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
    expect(resultA).toBe(false); // A superseded by B
    expect(resultB).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
