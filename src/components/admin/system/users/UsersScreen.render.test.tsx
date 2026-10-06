import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsersScreen } from './UsersScreen';

const { mockUseAdminUsers } = vi.hoisted(() => ({ mockUseAdminUsers: vi.fn() }));

vi.mock('./useAdminUsers', () => ({ useAdminUsers: mockUseAdminUsers }));

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'u_1',
    name: 'Priya Nair',
    email: 'priya@example.com',
    role: 'client',
    provider: 'google',
    createdAtIso: '2026-01-15T10:00:00.000Z',
    accountDisabled: false,
    sessionRevokeBeforeSeconds: null,
    ...overrides,
  };
}

function baseState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rows: [] as unknown[],
    selfUid: 'admin_user_1',
    generatedAtIso: '2026-10-06T10:00:00.000Z',
    administrators: { ok: true, count: 2 },
    roleFilter: 'all',
    setRoleFilter: () => undefined,
    loading: false,
    initialLoading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    stale: false,
    failed: false,
    failedReason: null,
    reload: () => undefined,
    loadMore: () => undefined,
    lookup: { status: 'idle', rows: [], error: null, generatedAtIso: null },
    runLookup: () => undefined,
    clearLookup: () => undefined,
    ...overrides,
  };
}

describe('UsersScreen static render', () => {
  it('renders accounts with role badges, email and the platform-enforcement note', () => {
    mockUseAdminUsers.mockReturnValue(baseState({ rows: [row()] }));
    const html = renderToStaticMarkup(<UsersScreen />);
    expect(html).toContain('Priya Nair');
    expect(html).toContain('priya@example.com');
    expect(html).toContain('Client');
    expect(html).toContain('The platform enforces these changes, not this page.');
  });

  it('marks the signed-in administrator\'s own row and offers no controls on it', () => {
    mockUseAdminUsers.mockReturnValue(
      baseState({ rows: [row({ id: 'admin_user_1', role: 'admin' })] })
    );
    const html = renderToStaticMarkup(<UsersScreen />);
    expect(html).toContain('This is your account.');
    expect(html).not.toContain('Change role');
  });

  it('shows disabled and revoked states as badges, not as absence', () => {
    mockUseAdminUsers.mockReturnValue(
      baseState({
        rows: [
          row({ accountDisabled: true, sessionRevokeBeforeSeconds: 1_760_000_000, id: 'u_2' }),
        ],
      })
    );
    const html = renderToStaticMarkup(<UsersScreen />);
    expect(html).toContain('Disabled');
    expect(html).toContain('Sessions revoked');
    expect(html).toContain('Enable account');
  });

  it('names a failed read as missing, not empty', () => {
    mockUseAdminUsers.mockReturnValue(
      baseState({
        failed: true,
        failedReason: 'Could not be read just now. Reload to try again.',
      })
    );
    const html = renderToStaticMarkup(<UsersScreen />);
    expect(html).toContain('Could not be read just now. Reload to try again.');
    expect(html).toContain('missing, not empty');
  });

  it('shows a failed administrator count instead of pretending zero', () => {
    mockUseAdminUsers.mockReturnValue(
      baseState({
        administrators: { ok: false, reason: 'The administrator count could not be read just now.' },
      })
    );
    const html = renderToStaticMarkup(<UsersScreen />);
    expect(html).toContain('The administrator count could not be read just now.');
  });

  it('renders the exact-email lookup panel with its caveat', () => {
    mockUseAdminUsers.mockReturnValue(baseState());
    const html = renderToStaticMarkup(<UsersScreen />);
    expect(html).toContain('Find by exact email');
    expect(html).toContain('Exact match only.');
  });
});
