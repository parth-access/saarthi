import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowLeft } from 'lucide-react';
import { BackLink } from './BackLink';

/**
 * The navigation contract: every back action is a semantic link to a known
 * route, reachable by keyboard, and never a history mutation.
 */
describe('BackLink', () => {
  it('renders a link (not a button or div) to the given parent route', () => {
    const html = renderToStaticMarkup(
      <BackLink href="/therapist/sessions" label="Back to Sessions" />
    );

    expect(html).toContain('<a ');
    expect(html).toContain('href="/therapist/sessions"');
    expect(html).toContain('Back to Sessions');
    expect(html).not.toContain('<button');
  });

  it('is reachable by keyboard with a visible focus ring', () => {
    const html = renderToStaticMarkup(<BackLink href="/" label="Back to Saarthi" />);

    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-visible:ring-primary');
  });

  it('decorates with the arrow icon but hides it from assistive tech', () => {
    const html = renderToStaticMarkup(<BackLink href="/" label="Back to Saarthi" />);

    // The label is the accessible name; the icon is decorative.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('lucide-arrow-left');
  });

  it('accepts a custom icon and extra classes', () => {
    const html = renderToStaticMarkup(
      <BackLink href="/admin/bookings" label="Back to Bookings" icon={ArrowLeft} className="mb-6" />
    );

    expect(html).toContain('mb-6');
    expect(html).toContain('Back to Bookings');
  });

  it('never uses browser history as the destination', () => {
    const html = renderToStaticMarkup(<BackLink href="/" label="Back to Saarthi" />);

    expect(html).not.toContain('history.back');
    expect(html).not.toContain('javascript:');
  });
});
