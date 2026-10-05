import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from '@/types';

const authState = vi.hoisted(() => ({
  currentUser: null as User | null,
  loading: false,
}));

const navigationState = vi.hoisted(() => ({
  pathname: '/dashboard/bookings',
  router: { replace: vi.fn() },
}));

const capturedEffects = vi.hoisted(() => ({
  current: [] as Array<{
    effect: () => void | (() => void);
    dependencies: React.DependencyList | undefined;
  }>,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useEffect: (
      effect: () => void | (() => void),
      dependencies?: React.DependencyList
    ) => {
      capturedEffects.current.push({ effect, dependencies });
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => navigationState.router,
  usePathname: () => navigationState.pathname,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { ProtectedRoute } from './ProtectedRoute';

function renderRoute(allowedRoles?: Array<'admin' | 'therapist' | 'client'>): string {
  return renderToStaticMarkup(
    <ProtectedRoute allowedRoles={allowedRoles}>
      <main>Private content</main>
    </ProtectedRoute>
  );
}

function runLatestEffect(): void {
  capturedEffects.current.at(-1)?.effect();
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState.currentUser = null;
    authState.loading = false;
    navigationState.pathname = '/dashboard/bookings';
    vi.stubGlobal('window', { location: { search: '?status=confirmed&page=2' } });
    navigationState.router.replace.mockReset();
    capturedEffects.current = [];
  });

  it('carries the protected path and query into the unauthenticated login redirect', () => {
    const html = renderRoute(['client']);
    runLatestEffect();

    expect(navigationState.router.replace).toHaveBeenCalledOnce();
    expect(navigationState.router.replace).toHaveBeenCalledWith(
      '/login?next=%2Fdashboard%2Fbookings%3Fstatus%3Dconfirmed%26page%3D2'
    );
    expect(html).not.toContain('Private content');
  });

  it('does not redirect until auth loading has finished', () => {
    authState.loading = true;

    renderRoute(['client']);
    runLatestEffect();

    expect(navigationState.router.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['admin', '/admin'],
    ['therapist', '/therapist'],
    ['client', '/dashboard'],
  ] as const)('preserves the %s role-root redirect', (role, expectedPath) => {
    authState.currentUser = { uid: `${role}-1`, email: `${role}@example.com`, role };

    const html = renderRoute(role === 'admin' ? ['therapist'] : ['admin']);
    runLatestEffect();

    expect(navigationState.router.replace).toHaveBeenCalledWith(expectedPath);
    expect(html).not.toContain('Private content');
  });

  it('renders children without redirecting for an allowed role', () => {
    authState.currentUser = {
      uid: 'therapist-1',
      email: 'therapist@example.com',
      role: 'therapist',
    };

    const html = renderRoute(['therapist']);
    runLatestEffect();

    expect(html).toContain('Private content');
    expect(navigationState.router.replace).not.toHaveBeenCalled();
  });

  it('keeps effect dependencies stable when an equivalent allowedRoles array is recreated', () => {
    renderRoute(['client']);
    renderRoute(['client']);

    expect(capturedEffects.current).toHaveLength(2);
    expect(capturedEffects.current[0]?.dependencies).toEqual(
      capturedEffects.current[1]?.dependencies
    );
  });
});
