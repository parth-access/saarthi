import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The dashboard's data is scoped by the signed-in identity: one client-SDK
 * query keyed to `where('email', '==', currentUser.email)` plus per-therapist
 * profile reads. This pins the scoping — a therapist on /dashboard queries
 * with THEIR OWN email and can never construct a query for anyone else's
 * bookings — alongside the Firestore rules pin in roleMatrix.test.ts, which is
 * what actually enforces it server-side.
 */

const authState = vi.hoisted(() => ({
  currentUser: null as { uid: string; email: string; role: string; emailVerified?: boolean } | null,
}));

const { mockWhere, mockGetDocs } = vi.hoisted(() => ({
  mockWhere: vi.fn(),
  mockGetDocs: vi.fn(),
}));

const capturedEffects = vi.hoisted(() => ({
  current: [] as Array<() => void | (() => void)>,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), dependencies?: React.DependencyList) => {
      capturedEffects.current.push(effect);
      // Effects deliberately do not auto-run: each test decides when.
      void dependencies;
    },
  };
});

vi.mock('@/lib/firebase/client', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: mockWhere,
  getDocs: mockGetDocs,
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser }),
}));
vi.mock('@/lib/sessionDisplay', () => ({ sessionStartMs: vi.fn(() => NaN) }));
vi.mock('@/lib/perfTracing', () => ({ perfMark: vi.fn(), perfMeasure: vi.fn() }));

import { useDashboardData } from './useDashboardData';

function Probe() {
  useDashboardData();
  return null;
}

async function runDataEffect(): Promise<void> {
  const effect = capturedEffects.current.at(-1);
  if (!effect) throw new Error('no data effect captured');
  effect();
  // The effect kicks off an async chain (getDocs → therapist reads → state).
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedEffects.current = [];
  mockGetDocs.mockResolvedValue({ docs: [] });
});

describe('useDashboardData — self-scoped reads', () => {
  it('queries bookings keyed to the signed-in account email once that email is verified', async () => {
    authState.currentUser = { uid: 'therapist_uid', email: 'therapist@example.com', role: 'therapist', emailVerified: true };

    renderToStaticMarkup(<Probe />);
    await runDataEffect();

    expect(mockWhere).toHaveBeenCalledWith('email', '==', 'therapist@example.com');
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('falls back to the account id while the email is unverified (email is not ownership proof yet)', async () => {
    authState.currentUser = { uid: 'client_uid', email: 'someone@example.com', role: 'client', emailVerified: false };

    renderToStaticMarkup(<Probe />);
    await runDataEffect();

    expect(mockWhere).toHaveBeenCalledWith('userId', '==', 'client_uid');
    expect(mockWhere).not.toHaveBeenCalledWith('email', '==', 'someone@example.com');
  });

  it('never queries when there is no signed-in identity', async () => {
    authState.currentUser = null;

    renderToStaticMarkup(<Probe />);
    await runDataEffect();

    expect(mockWhere).not.toHaveBeenCalled();
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});

describe('useDashboardData — Better Auth', () => {
  it('reads through /api/me/bookings and never touches Firestore', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bookings: [], therapists: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      authState.currentUser = { uid: 'u1', email: 'a@example.com', role: 'client', emailVerified: true };

      renderToStaticMarkup(<Probe />);
      await runDataEffect();

      expect(fetchMock).toHaveBeenCalledWith('/api/me/bookings', { cache: 'no-store' });
      expect(mockGetDocs).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
