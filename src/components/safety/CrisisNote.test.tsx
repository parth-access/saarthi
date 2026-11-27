import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CrisisNote } from './CrisisNote';

describe('CrisisNote', () => {
  const html = renderToStaticMarkup(<CrisisNote />);
  it('says Saarthi is not an emergency service', () => {
    expect(html).toContain('Saarthi is not an emergency service.');
  });
  it('links Tele-MANAS and 112 as tap-to-call numbers', () => {
    expect(html).toContain('href="tel:14416"');
    expect(html).toContain('href="tel:18008914416"');
    expect(html).toContain('href="tel:112"');
  });
});
