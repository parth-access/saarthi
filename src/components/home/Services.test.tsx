import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Services from './Services';

/**
 * The home "Our Services" section: the four service names the founders signed
 * off, and the arrow that reveals Workshops and Saarthi Classes. The reveal
 * starts closed and inert, so its links are not reachable until it is opened.
 */
describe('Home Services section', () => {
  const html = renderToStaticMarkup(<Services />);

  it('uses the approved service names', () => {
    expect(html).toContain('Teens and Individual Counselling');
    expect(html).toContain('Stress and Anger Management');
    expect(html).toContain('Career Guidance');
    expect(html).toContain('Relationship Guidance');
    expect(html).not.toContain('Teams and Individual Consultation');
    expect(html).not.toMatch(/>Stress Management</);
  });

  it('renders the arrow closed, pointing at the hidden programmes', () => {
    const button = html.match(/<button[^>]*aria-controls="([^"]+)"[^>]*>/);
    expect(button).not.toBeNull();
    expect(button![0]).toContain('aria-expanded="false"');
    expect(button![0]).toContain('aria-label="Show Workshops and Saarthi Classes"');
    const panelId = button![1];
    expect(html).toMatch(new RegExp(`id="${panelId}"[^>]*inert`));
  });

  it('links Workshops to Contact and Saarthi Classes to the classes site', () => {
    expect(html).toContain('Workshops');
    expect(html).toContain('Saarthi Classes');
    expect(html.match(/href="\/contact"/g)).toHaveLength(1);
    const classes = html.match(/<a[^>]*href="https:\/\/classes\.saarthilife\.com"[^>]*>/);
    expect(classes).not.toBeNull();
    expect(classes![0]).toContain('target="_blank"');
    expect(classes![0]).toContain('rel="noopener noreferrer"');
  });
});
