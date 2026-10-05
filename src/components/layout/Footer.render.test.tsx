import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Footer } from './Footer';

/**
 * The footer is the most-crawled surface on the site, so it must not advertise
 * the admin console. Removing the link is a public-surface cleanup only: the
 * route, its authorization and the admin navigation are untouched.
 */
describe('public footer', () => {
  it('does not link to the admin dashboard', () => {
    const html = renderToStaticMarkup(<Footer />);

    expect(html).not.toContain('Admin Dashboard');
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toMatch(/href="\/admin[\/"']/);
  });

  it('keeps the public quick links and legal pages', () => {
    const html = renderToStaticMarkup(<Footer />);

    for (const href of ['/therapists', '/about', '/vision', '/contact', '/privacy', '/terms']) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('Privacy Policy');
    expect(html).toContain('Terms of Service');
  });

  it('keeps the branding, contact details and social profiles', () => {
    const html = renderToStaticMarkup(<Footer />);

    expect(html).toContain('/saarthi-logo-Photoroom.png');
    expect(html).toContain('contact@saarthilife.com');

    for (const network of ['Instagram', 'YouTube', 'Facebook', 'LinkedIn']) {
      expect(html).toContain(`aria-label="${network}"`);
    }
    // Social links open in a new tab, safely.
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});
