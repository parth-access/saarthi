import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ fetchWithAuth: vi.fn(), getDocs: vi.fn() }));

vi.mock('@/lib/fetchWithAuth', () => ({ fetchWithAuth: h.fetchWithAuth }));
vi.mock('../lib/firebase/firestore', () => ({ db: {} }));
vi.mock('../lib/firebaseUtils', () => ({ handleFirestoreError: vi.fn(), OperationType: { LIST: 'list' } }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), getDocs: h.getDocs, query: vi.fn(), where: vi.fn() }));

import { therapistService } from './therapistService';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const ok = (items: unknown[]) => ({ ok: true, json: async () => ({ items }) });

describe('therapistService availability under Better Auth', () => {
  it('reads recurring rules through the API', async () => {
    h.fetchWithAuth.mockResolvedValue(ok([{ id: 'r1' }]));
    expect(await therapistService.getAvailabilityRules('t 1')).toEqual([{ id: 'r1' }]);
    expect(h.fetchWithAuth).toHaveBeenCalledWith('/api/therapist/availability/rule?therapistId=t%201');
    expect(h.getDocs).not.toHaveBeenCalled();
  });

  it('reads overrides through the API', async () => {
    h.fetchWithAuth.mockResolvedValue(ok([{ id: 'o1' }]));
    expect(await therapistService.getOverrides('t1')).toEqual([{ id: 'o1' }]);
    expect(h.fetchWithAuth).toHaveBeenCalledWith('/api/therapist/availability/override?therapistId=t1');
  });

  it('returns an empty schedule when the API refuses', async () => {
    h.fetchWithAuth.mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) });
    expect(await therapistService.getAvailabilityRules('t1')).toEqual([]);
  });
});
