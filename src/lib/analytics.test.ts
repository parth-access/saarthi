import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent } from './analytics';

describe('GA4 trackEvent Utility', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-6R1CSK4D3H';
    (globalThis as unknown as { window: { gtag?: ReturnType<typeof vi.fn> } }).window = {
      gtag: vi.fn(),
    };
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = originalEnv;
    delete (globalThis as unknown as { window?: unknown }).window;
    vi.restoreAllMocks();
  });

  it('safely triggers window.gtag with event name and sanitized params', () => {
    trackEvent('book_demo_click', {
      location: 'hero_section',
      cta_text: 'Book a Session',
    });

    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith('event', 'book_demo_click', {
      location: 'hero_section',
      cta_text: 'Book a Session',
    });
  });

  it('strips PII from parameters before calling gtag', () => {
    trackEvent('book_demo_submitted', {
      session_type: 'Individual',
      date_selected: '2026-08-20',
      email: 'user@example.com',
      phone: '+919999999999',
      name: 'John Doe',
      full_name: 'John Doe',
      message: 'Private therapeutic note',
      password: 'secretPassword123',
    });

    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith('event', 'book_demo_submitted', {
      session_type: 'Individual',
      date_selected: '2026-08-20',
    });
  });

  it('does nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID is missing', () => {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

    trackEvent('book_demo_started', {
      session_type: 'Individual',
    });

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('does not throw when window.gtag is not defined', () => {
    delete (window as unknown as { gtag?: unknown }).gtag;

    expect(() => {
      trackEvent('book_demo_click', { location: 'navbar' });
    }).not.toThrow();
  });

  it('handles unexpected exceptions safely without throwing', () => {
    window.gtag = vi.fn().mockImplementation(() => {
      throw new Error('GTag internal fault');
    });

    expect(() => {
      trackEvent('contact_form_submitted', { form_name: 'contact' });
    }).not.toThrow();
  });

  it('is a safe no-op on the server side where window is undefined', () => {
    delete (globalThis as unknown as { window?: unknown }).window;

    expect(() => {
      trackEvent('book_demo_click', { location: 'ssr' });
    }).not.toThrow();
  });
});
