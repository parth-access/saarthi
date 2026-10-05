import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { User } from '@/types';

const authState = vi.hoisted(() => ({ currentUser: null as User | null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

import Navbar from './Navbar';

describe('public navigation resources CTA', () => {
  beforeEach(() => { authState.currentUser = null; });

  it('does not send a therapist to a client-only route', () => {
    authState.currentUser = { uid: 't', email: 't@example.test', role: 'therapist' };
    const html = renderToStaticMarkup(<Navbar />);
    expect(html).toContain('href="/therapist"');
    expect(html).not.toContain('href="/dashboard/resources"');
  });

  it.each(['client', 'admin'] as const)('keeps Resources for %s', (role) => {
    authState.currentUser = { uid: role, email: `${role}@example.test`, role };
    expect(renderToStaticMarkup(<Navbar />)).toContain('href="/dashboard/resources"');
  });
});
