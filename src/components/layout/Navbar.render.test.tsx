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

describe('Saarthi Classes button', () => {
  beforeEach(() => { authState.currentUser = null; });

  it('links to the classes site in a new tab, for everyone', () => {
    for (const user of [null, { uid: 'c', email: 'c@example.test', role: 'client' as const }]) {
      authState.currentUser = user;
      const html = renderToStaticMarkup(<Navbar />);
      const link = html.match(/<a[^>]*href="https:\/\/classes\.saarthilife\.com"[^>]*>/);
      expect(link).not.toBeNull();
      expect(link![0]).toContain('target="_blank"');
      expect(link![0]).toContain('rel="noopener noreferrer"');
      expect(html).toContain('Saarthi Classes');
    }
  });
});
