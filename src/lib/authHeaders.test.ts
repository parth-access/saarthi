import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { firebaseAuth } = vi.hoisted(() => ({ firebaseAuth: { currentUser: null as null | { getIdToken: () => Promise<string> } } }));
vi.mock('@/lib/firebase/client', () => ({ auth: firebaseAuth }));

import { authHeaders } from './authHeaders';

beforeEach(() => {
  firebaseAuth.currentUser = null;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_PROVIDER;
});

describe('authHeaders', () => {
  it('sends the Firebase ID token as a Bearer header', async () => {
    firebaseAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue('id_tok') };
    expect(await authHeaders()).toEqual({ Authorization: 'Bearer id_tok' });
  });

  it('returns null when nobody is signed in to Firebase', async () => {
    expect(await authHeaders()).toBeNull();
  });

  it('adds nothing under Better Auth, where the session cookie authenticates', async () => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'better-auth';
    firebaseAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue('stale') };
    expect(await authHeaders()).toEqual({});
  });
});
