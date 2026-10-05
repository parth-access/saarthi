import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkDistributedRateLimit } from './distributedRateLimit';

/**
 * The shared limiter must enforce its ceiling across serverless instances
 * (Firestore transaction counter), hash the client IP, and fail OPEN to the
 * per-instance bucket when the counter store is unavailable.
 */

const h = vi.hoisted(() => ({ tx: null as null | Record<string, unknown> }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    runTransaction: (fn: (t: unknown) => Promise<boolean>) => {
      if (!h.tx) throw new Error('no transaction fixture installed');
      return fn(h.tx);
    },
    collection: () => ({
      doc: (id: string) => ({
        __docId: id,
        then: undefined, // ensure it is not treated as a promise
      }),
    }),
  },
}));

function installDoc(data?: Record<string, unknown>) {
  h.tx = {
    get: vi.fn().mockResolvedValue(
      data === undefined
        ? { exists: false }
        : { exists: true, data: () => data }
    ),
    set: vi.fn(),
    update: vi.fn(),
  };
}

const NOW = 1_700_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkDistributedRateLimit', () => {
  it('creates a fresh counter on the first request', async () => {
    installDoc(undefined);
    const result = await checkDistributedRateLimit('203.0.113.5', 'email_send', 10, 60_000);

    expect(result).toEqual({ success: true, store: 'firestore' });
    const set = (h.tx!.set as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(set.count).toBe(1);
    expect(set.windowStart).toBe(NOW);
  });

  it('increments the shared counter under the limit', async () => {
    installDoc({ count: 4, windowStart: NOW - 10_000 });
    const result = await checkDistributedRateLimit('203.0.113.5', 'email_send', 10, 60_000);

    expect(result).toEqual({ success: true, store: 'firestore' });
    const updatePayload = (h.tx!.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(updatePayload.count).toBe(5);
  });

  it('refuses once the shared counter reaches the limit (decision is cross-instance)', async () => {
    installDoc({ count: 10, windowStart: NOW - 10_000 });
    const result = await checkDistributedRateLimit('203.0.113.5', 'email_send', 10, 60_000);

    expect(result).toEqual({ success: false, store: 'firestore' });
  });

  it('resets the counter when the window has elapsed', async () => {
    installDoc({ count: 10, windowStart: NOW - 61_000 });
    const result = await checkDistributedRateLimit('203.0.113.5', 'email_send', 10, 60_000);

    expect(result).toEqual({ success: true, store: 'firestore' });
    expect((h.tx!.set as ReturnType<typeof vi.fn>).mock.calls[0][1].count).toBe(1);
  });

  it('never stores the plaintext IP (salted hash only)', async () => {
    installDoc(undefined);
    await checkDistributedRateLimit('203.0.113.5', 'email_send', 10, 60_000);
    // The mock collection above cannot see the doc id; assert instead that no
    // write payload or doc-path input contains the raw IP.
    const writes = JSON.stringify([
      (h.tx!.set as ReturnType<typeof vi.fn>).mock.calls,
      (h.tx!.update as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(writes).not.toContain('203.0.113.5');
  });

  it('fails OPEN to the per-instance bucket when the counter store errors', async () => {
    h.tx = null; // runTransaction throws
    const result = await checkDistributedRateLimit(`203.0.113.${Math.ceil(Math.random() * 250)}`, 'email_send', 10, 60_000);

    expect(result).toEqual({ success: true, store: 'memory' });
  });

  it('still refuses when the store errors but the in-memory bucket is exhausted', async () => {
    h.tx = null;
    const ip = `203.0.114.${Math.ceil(Math.random() * 250)}`;
    for (let i = 0; i < 10; i++) {
      await checkDistributedRateLimit(ip, 'email_send', 10, 60_000);
    }
    const result = await checkDistributedRateLimit(ip, 'email_send', 10, 60_000);
    expect(result).toEqual({ success: false, store: 'memory' });
  });
});
