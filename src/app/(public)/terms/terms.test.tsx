import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from './page';
import { computeRefundPercent } from '@/domains/payment/RefundPolicy';

/**
 * The terms must describe the refund tiers the server actually applies
 * (RefundPolicy.computeRefundPercent), so clients are never told one thing and
 * refunded another.
 */
describe('Terms: cancellation and refund wording', () => {
  const text = renderToStaticMarkup(<TermsPage />).replace(/<[^>]+>/g, '');
  const HOUR = 60 * 60 * 1000;
  const now = Date.UTC(2026, 10, 28, 6, 0);

  it('states the three refund tiers', () => {
    expect(text).toContain('48 hours or more: a full (100%) refund.');
    expect(text).toContain('24 to 48 hours: a 50% refund.');
    expect(text).toContain('Less than 24 hours: no refund');
  });

  it('matches what the refund policy code computes', () => {
    expect(computeRefundPercent(now + 72 * HOUR, now)).toBe(100);
    expect(computeRefundPercent(now + 30 * HOUR, now)).toBe(50);
    expect(computeRefundPercent(now + 12 * HOUR, now)).toBe(0);
  });

  it('no longer says a late cancellation only "may" lose the fee', () => {
    expect(text).not.toMatch(/may be forfeited/);
  });
});
