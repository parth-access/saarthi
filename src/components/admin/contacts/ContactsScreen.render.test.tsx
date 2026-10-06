import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ContactRow } from '@/domains/admin/contactTriage';

vi.mock('./useAdminContacts', () => ({ useAdminContacts: vi.fn() }));

import { ContactsScreen } from './ContactsScreen';
import { useAdminContacts } from './useAdminContacts';

const mockedHook = vi.mocked(useAdminContacts);

function row(overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    id: 'contact_1',
    name: 'Asha',
    email: 'asha@example.com',
    message: 'Do you offer evening sessions?',
    status: 'unread',
    priority: 'normal',
    source: 'website',
    createdAtIso: '2026-10-06T09:00:00.000Z',
    lastUpdatedAtIso: null,
    ...overrides,
  };
}

function mockState(overrides: Record<string, unknown> = {}) {
  mockedHook.mockReturnValue({
    rows: [row()],
    loading: false,
    initialLoading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
    stale: false,
    generatedAtIso: '2026-10-06T09:00:00.000Z',
    failed: false,
    failedReason: null,
    reload: vi.fn(),
    loadMore: vi.fn(),
    ...overrides,
  } as never);
}

describe('ContactsScreen rendering', () => {
  it('renders an inquiry with the legacy status actions', () => {
    mockState();
    const html = renderToStaticMarkup(<ContactsScreen />);
    expect(html).toContain('Asha');
    expect(html).toContain('Do you offer evening sessions?');
    expect(html).toContain('Resolve');
    expect(html).toContain('Mark spam');
    expect(html).toContain('Delete');
  });

  it('never claims the platform replies — the mailto is the reply path', () => {
    mockState();
    const html = renderToStaticMarkup(<ContactsScreen />);
    expect(html).toContain('Replies are not sent from here.');
    expect(html).toContain('asha@example.com');
  });

  it('renders a failed read as a named gap, not an empty list', () => {
    mockState({
      rows: [],
      failed: true,
      failedReason: 'Could not be read just now. Reload to try again.',
    });
    const html = renderToStaticMarkup(<ContactsScreen />);
    expect(html).toContain('This page is missing, not empty');
  });

  it('shows an in-progress row honestly without offering a button that sets it', () => {
    mockState({ rows: [row({ status: 'in-progress' })] });
    const html = renderToStaticMarkup(<ContactsScreen />);
    expect(html).toContain('In progress');
    // From in-progress the operator may resolve, unread or spam it — but no
    // button re-sets it to in-progress, preserving the legacy action set.
    expect(html).toContain('Resolve');
  });

  it('offers Load more only when a cursor remains', () => {
    mockState({ hasMore: true });
    expect(renderToStaticMarkup(<ContactsScreen />)).toContain('Load more');
    mockState({ hasMore: false });
    expect(renderToStaticMarkup(<ContactsScreen />)).not.toContain('Load more');
  });
});
