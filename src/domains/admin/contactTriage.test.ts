import { describe, it, expect } from 'vitest';
import {
  contactStatusBadge,
  isSettableStatus,
  filterContacts,
  messagePreview,
  type ContactRow,
} from '@/domains/admin/contactTriage';

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

describe('contact status vocabulary', () => {
  it('keeps `in-progress` visible but never settable', () => {
    expect(isSettableStatus('in-progress')).toBe(false);
    expect(isSettableStatus('unread')).toBe(true);
    expect(isSettableStatus('resolved')).toBe(true);
    expect(isSettableStatus('spam')).toBe(true);
    expect(contactStatusBadge('in-progress').title).toContain('never settable');
  });
});

describe('messagePreview', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    expect(messagePreview('a\n  b\t c')).toBe('a b c');
    const long = messagePreview('x'.repeat(300));
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('filterContacts', () => {
  const rows = [
    row(),
    row({ id: 'c2', name: 'Rahul', status: 'spam', message: 'Bulk offer' }),
  ];

  it('filters by status and term', () => {
    expect(filterContacts(rows, 'spam', '')).toHaveLength(1);
    expect(filterContacts(rows, null, 'rahul')).toHaveLength(1);
    expect(filterContacts(rows, null, 'evening')).toHaveLength(1);
  });

  it('is a no-op with all/no filters', () => {
    expect(filterContacts(rows, 'all', ' ')).toHaveLength(2);
  });
});
