import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Auth state is injected per test: the login page has two branches — the
 * auth-loading placeholder (which is what the server and the client's first
 * paint render, because `AuthProvider` starts with `loading: true`) and the form
 * itself. Both must carry the way out.
 */
const authState = vi.hoisted(() => ({
  current: { currentUser: null as unknown, loading: true, sessionSyncComplete: null },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
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
});
