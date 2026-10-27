// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

/**
 * AuthContext under NEXT_PUBLIC_AUTH_PROVIDER=better-auth: the context is fed
 * by Better Auth's useSession() with the same shape the Firebase provider
 * gives, so pages and guards work unchanged.
 */
const h = vi.hoisted(() => ({
  session: { data: null as null | { user: Record<string, unknown> }, isPending: false },
  refresh: vi.fn(),
  replace: vi.fn(),
  service: { login: vi.fn(), logout: vi.fn(), register: vi.fn(), loginWithGoogle: vi.fn() },
}));

vi.mock('@/lib/auth/authClient', () => ({ authClient: { useSession: () => h.session } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh, replace: h.replace }) }));
vi.mock('../services/authService', () => ({ authService: h.service }));
vi.mock('../lib/firebase/client', () => ({ auth: null, db: null }));

type Ctx = ReturnType<typeof import('./AuthContext').useAuth>;

let root: Root;
let container: HTMLDivElement;
let ctx: Ctx;

async function render() {
  const { AuthProvider, useAuth } = await import('./AuthContext');
  const Probe = () => {
    ctx = useAuth();
    return null;
  };
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_AUTH_PROVIDER', 'better-auth');
  h.session = { data: null, isPending: false };
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllEnvs();
});

const user = (extra: Record<string, unknown> = {}) => ({
  id: 'uid_1', email: 'a@x.com', emailVerified: true, name: 'Asha', role: 'therapist', banned: false, ...extra,
});

describe('AuthProvider (better-auth)', () => {
  it('exposes the signed-in user with their role', async () => {
    h.session = { data: { user: user() }, isPending: false };
    await render();
    expect(ctx.currentUser).toEqual({ uid: 'uid_1', email: 'a@x.com', emailVerified: true, role: 'therapist', name: 'Asha' });
    expect(ctx.loading).toBe(false);
    await expect(ctx.sessionSyncComplete).resolves.toMatchObject({ ok: true });
  });

  it('treats an unknown role as client', async () => {
    h.session = { data: { user: user({ role: 'superuser' }) }, isPending: false };
    await render();
    expect(ctx.currentUser?.role).toBe('client');
  });

  it('never exposes a banned user', async () => {
    h.session = { data: { user: user({ banned: true }) }, isPending: false };
    await render();
    expect(ctx.currentUser).toBeNull();
    expect(ctx.sessionSyncComplete).toBeNull();
  });

  it('is loading while the session is being read', async () => {
    h.session = { data: null, isPending: true };
    await render();
    expect(ctx.loading).toBe(true);
    expect(ctx.currentUser).toBeNull();
  });

  it('passes sign-in through to the service and surfaces its error', async () => {
    h.service.login.mockRejectedValue(Object.assign(new Error('bad'), { code: 'auth/invalid-credential' }));
    await render();
    await act(async () => {
      await expect(ctx.login('a@x.com', 'nope')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
    });
    expect(h.service.login).toHaveBeenCalledWith('a@x.com', 'nope');
    expect(ctx.loading).toBe(false);
  });

  it('signs out and leaves for the home page', async () => {
    h.session = { data: { user: user() }, isPending: false };
    h.service.logout.mockResolvedValue(undefined);
    await render();
    await act(async () => {
      await ctx.logout();
    });
    expect(h.service.logout).toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith('/');
  });
});
