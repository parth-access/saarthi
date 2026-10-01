import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('framer-motion', () => ({ motion: { div: 'div', section: 'section' }, AnimatePresence: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/forms/ContactForm', () => ({ ContactForm: () => null }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

import ContactPage from './ContactClient';

describe('contact page discovery CTA', () => {
  it('labels the therapist directory destination as browsing, not booking', () => {
    const html = renderToStaticMarkup(<ContactPage />);
    expect(html).toMatch(/href="\/therapists"[^>]*>\s*Browse therapists/);
    expect(html).not.toContain('Book a Session');
  });
});
