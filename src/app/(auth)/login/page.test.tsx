import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from '@/types';

/**
 * Auth state is injected per test: the login page has two branches — the
 * auth-loading placeholder (which is what the server and the client's first
 * paint render, because `AuthProvider` starts with `loading: true`) and the form
 * itself. Both must carry the way out.
 */
const authState = vi.hoisted(() => ({
  current: {
    currentUser: null as User | null,
    loading: true,
    sessionSyncComplete: null as Promise<boolean> | null,
  },
}));

const navigationState = vi.hoisted(() => ({
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
  nextValues: [] as string[],
}));

const loginEffect = vi.hoisted(() => ({
  current: null as null | (() => void | (() => void)),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), dependencies?: React.DependencyList) => {
      if (dependencies?.includes(navigationState.router)) {
        loginEffect.current = effect;
        return;
      }
      actual.useEffect(effect, dependencies);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => navigationState.router,
  useSearchParams: () => ({
    getAll: (key: string) => key === 'next' ? navigationState.nextValues : [],
  }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: authState.current.currentUser,
    loading: authState.current.loading,
    sessionSyncComplete: authState.current.sessionSyncComplete,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

import Login from './page';

function renderLogin(): string {
  return renderToStaticMarkup(<Login />);
}

/**
 * A signed-out visitor can land on /login from anywhere — an email link, a
 * guard redirect, a bookmark. It must never be a dead end, and its way out has
 * to be a static destination rather than browser history (which, after a logout
 * or a redirect chain, may point back at a protected route).
 */
describe('/login navigation', () => {
  beforeEach(() => {
    authState.current = { currentUser: null, loading: false, sessionSyncComplete: null };
    navigationState.nextValues = [];
    navigationState.router.replace.mockReset();
    loginEffect.current = null;
  });

  it('offers a link back to the public Saarthi home', () => {
    const html = renderLogin();

    expect(html).toContain('Back to Saarthi');
    expect(html).toContain('href="/"');
  });

  it('does not depend on browser history to escape', () => {
    const html = renderLogin();

    expect(html).not.toContain('history.back');
    expect(html).not.toContain('router.back');
  });

  it('still renders the sign-in form for a signed-out visitor', () => {
    const html = renderLogin();

    expect(html).toContain('Welcome back');
    expect(html).toContain('Sign In');
  });

  it('keeps the way out while auth is still resolving, so a stalled bootstrap is not a dead end', () => {
    authState.current = { currentUser: null, loading: true, sessionSyncComplete: null };

    const html = renderLogin();

    expect(html).toContain('Loading safe space');
    expect(html).toContain('Back to Saarthi');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('Welcome back');
  });

  it('waits for successful cookie sync before returning to a role-authorized destination', async () => {
    let finishSync!: (synced: boolean) => void;
    const sessionSyncComplete = new Promise<boolean>((resolve) => {
      finishSync = resolve;
    });
    authState.current = {
      currentUser: { uid: 'client-1', email: 'client@example.com', role: 'client' },
      loading: false,
      sessionSyncComplete,
    };
    navigationState.nextValues = ['/dashboard/bookings?status=pending'];

    renderLogin();
    loginEffect.current?.();
    expect(navigationState.router.replace).not.toHaveBeenCalled();

    finishSync(true);
    await sessionSyncComplete;
    await Promise.resolve();

    expect(navigationState.router.replace).toHaveBeenCalledOnce();
    expect(navigationState.router.replace).toHaveBeenCalledWith(
      '/dashboard/bookings?status=pending'
    );
  });

  it('falls back to the role root for duplicate next parameters', async () => {
    const sessionSyncComplete = Promise.resolve(true);
    authState.current = {
      currentUser: { uid: 'client-1', email: 'client@example.com', role: 'client' },
      loading: false,
      sessionSyncComplete,
    };
    navigationState.nextValues = ['/dashboard/profile', '/dashboard/bookings'];

    renderLogin();
    loginEffect.current?.();
    await sessionSyncComplete;
    await Promise.resolve();

    expect(navigationState.router.replace).toHaveBeenCalledWith('/dashboard');
  });

  it('falls back to the role root when next belongs to another role', async () => {
    const sessionSyncComplete = Promise.resolve(true);
    authState.current = {
      currentUser: { uid: 'therapist-1', email: 'therapist@example.com', role: 'therapist' },
      loading: false,
      sessionSyncComplete,
    };
    navigationState.nextValues = ['/admin/bookings'];

    renderLogin();
    loginEffect.current?.();
    await sessionSyncComplete;
    await Promise.resolve();

    expect(navigationState.router.replace).toHaveBeenCalledWith('/therapist');
  });

  it.each([
    ['therapist', '/therapist/sessions?view=upcoming'],
    ['admin', '/admin/bookings?status=pending'],
  ] as const)('returns a signed-in %s to an eligible nested page', async (role, destination) => {
    const sessionSyncComplete = Promise.resolve(true);
    authState.current = {
      currentUser: { uid: `${role}-1`, email: `${role}@example.com`, role },
      loading: false,
      sessionSyncComplete,
    };
    navigationState.nextValues = [destination];

    renderLogin();
    loginEffect.current?.();
    await sessionSyncComplete;

    expect(navigationState.router.replace).toHaveBeenCalledWith(destination);
  });

  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', 'data:text/html,evil'])
    ('ignores a malicious next value %s', async (destination) => {
      const sessionSyncComplete = Promise.resolve(true);
      authState.current = {
        currentUser: { uid: 'client-1', email: 'client@example.com', role: 'client' },
        loading: false,
        sessionSyncComplete,
      };
      navigationState.nextValues = [destination];

      renderLogin();
      loginEffect.current?.();
      await sessionSyncComplete;

      expect(navigationState.router.replace).toHaveBeenCalledWith('/dashboard');
    });

  it('does not navigate on a previous sync while a new auth state is loading', async () => {
    const sessionSyncComplete = Promise.resolve(true);
    authState.current = {
      currentUser: { uid: 'client-1', email: 'client@example.com', role: 'client' },
      loading: true,
      sessionSyncComplete,
    };

    renderLogin();
    loginEffect.current?.();
    await sessionSyncComplete;

    expect(navigationState.router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['a false result', () => Promise.resolve(false)],
    ['a rejected sync', () => Promise.reject(new Error('sync failed'))],
  ])('does not enter a protected redirect loop after %s', async (_label, createSessionSync) => {
    const sessionSyncComplete = createSessionSync();
    authState.current = {
      currentUser: { uid: 'client-1', email: 'client@example.com', role: 'client' },
      loading: false,
      sessionSyncComplete,
    };

    const html = renderLogin();
    loginEffect.current?.();
    await sessionSyncComplete.catch(() => false);
    await Promise.resolve();

    expect(navigationState.router.replace).not.toHaveBeenCalled();
    expect(html).toContain('Back to Saarthi');
    expect(html).toContain('href="/"');
  });

  it('does not navigate after the redirect effect has been cleaned up', async () => {
    let finishSync!: (synced: boolean) => void;
    const sessionSyncComplete = new Promise<boolean>((resolve) => {
      finishSync = resolve;
    });
    authState.current = {
      currentUser: { uid: 'client-1', email: 'client@example.com', role: 'client' },
      loading: false,
      sessionSyncComplete,
    };
    navigationState.nextValues = ['/dashboard/profile'];

    renderLogin();
    const cleanup = loginEffect.current?.();
    cleanup?.();
    finishSync(true);
    await sessionSyncComplete;
    await Promise.resolve();

    expect(navigationState.router.replace).not.toHaveBeenCalled();
  });
});
