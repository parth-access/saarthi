import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JoinTeamCard } from './TherapistsClient';

describe('therapist joining CTA', () => {
  it('describes the generic contact form as an enquiry rather than an application', () => {
    const html = renderToStaticMarkup(<JoinTeamCard />);
    expect(html).toMatch(/href="\/contact"[^>]*>Enquire about joining/);
    expect(html).not.toContain('Apply Now');
  });
});
