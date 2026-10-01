import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
}));

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

vi.mock('@/components/therapist/AboutSection', () => ({ default: () => null }));
vi.mock('@/components/therapist/Specializations', () => ({ default: () => null }));
vi.mock('@/components/therapist/Qualifications', () => ({ default: () => null }));
vi.mock('@/components/therapist/Approach', () => ({ default: () => null }));
vi.mock('@/components/therapist/TherapistProcess', () => ({ default: () => null }));
vi.mock('@/components/therapist/SessionDetails', () => ({ default: () => null }));

import DravinaProfilePage from './DravinaClient';

describe('Dravina profile booking CTA', () => {
  it('books Dravina by stable slug and does not advertise a nonexistent public schedule', () => {
    const html = renderToStaticMarkup(<DravinaProfilePage />);

    expect(html).toContain('href="/book?therapist=dravina"');
    expect(html.match(/href="\/book\?therapist=dravina"/g)).toHaveLength(2);
    expect(html).toContain('Book Session');
    expect(html).not.toContain('View Schedule');
  });
});
