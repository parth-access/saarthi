import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('framer-motion', () => ({
  motion: { div: 'div', h1: 'h1', p: 'p' },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

import TherapistsPage from './TherapistsClient';

/**
 * The directory gets its list from the server, so the cards must be in the
 * first HTML: search engines and link previews never saw them while the page
 * fetched them in the browser behind a loading message.
 */
describe('therapist directory', () => {
  const therapists = [
    { id: 'a', name: 'Dravina Gupta', slug: 'dravina', specialization: 'Counselling Psychologist', experience: '1+ Years', bio: 'Anxiety and stress.', image: '/dravina.webp', active: true },
    { id: 'b', name: 'Asha Rao', specialization: '', experience: '', bio: 'Family concerns.', image: '', active: true },
  ];

  it('renders every therapist card without a loading state', () => {
    const html = renderToStaticMarkup(<TherapistsPage therapists={therapists} />);

    expect(html).toContain('Dravina Gupta');
    expect(html).toContain('Asha Rao');
    expect(html).toContain('href="/therapists/dravina"');
    expect(html).not.toContain('Connecting you with');
  });

  it('makes no credential claim the profile data does not support', () => {
    const html = renderToStaticMarkup(<TherapistsPage therapists={therapists} />);

    expect(html).not.toMatch(/Verified M\.A\.|Verified Team/);
    expect(html.match(/Counselling Psychologist/g)).toHaveLength(1);
  });
});
