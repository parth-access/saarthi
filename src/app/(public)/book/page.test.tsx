import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/booking/BookingSystem', () => ({
  default: ({ requestedTherapist }: { requestedTherapist?: string | null }) => (
    <div data-requested-therapist={requestedTherapist ?? 'none'} />
  ),
}));

import Page from './page';

const renderPage = async (therapist?: string | string[]) => {
  const page = await Page({
    searchParams: Promise.resolve(therapist === undefined ? {} : { therapist }),
  });
  return renderToStaticMarkup(page);
};

describe('/book therapist query', () => {
  it.each(['firestore-therapist-id', 'dravina'])(
    'passes a single therapist ID or slug through to the booking system: %s',
    async (requestedTherapist) => {
      expect(await renderPage(requestedTherapist)).toContain(
        `data-requested-therapist="${requestedTherapist}"`
      );
    }
  );

  it('treats a missing therapist query as an ordinary booking visit', async () => {
    expect(await renderPage()).toContain('data-requested-therapist="none"');
  });

  it('does not choose between duplicate therapist query values', async () => {
    expect(await renderPage(['dravina', 'another'])).toContain(
      'data-requested-therapist="none"'
    );
  });
});
