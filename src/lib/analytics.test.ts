import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent, sanitizePageLocation } from './analytics';

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

describe('Booking-token privacy (analytics boundary)', () => {
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

  it('scrubs a token-bearing URL passed as an event parameter value', () => {
    trackEvent('booking_flow_started', {
      page: '/manage-booking?token=TEST_SECRET_TOKEN',
    });

    expect(window.gtag).toHaveBeenCalledWith('event', 'booking_flow_started', {
      page: '/manage-booking',
    });
  });

  it('drops parameters keyed "token" entirely, whatever the value', () => {
    trackEvent('booking_flow_started', { token: 'TEST_SECRET_TOKEN' });

    expect(window.gtag).toHaveBeenCalledWith('event', 'booking_flow_started', {});
  });

  it('leaves ordinary string values untouched', () => {
    trackEvent('book_demo_click', { location: 'hero_section' });

    expect(window.gtag).toHaveBeenCalledWith('event', 'book_demo_click', {
      location: 'hero_section',
    });
  });
});

describe('sanitizePageLocation', () => {
  it('strips the booking token from a manage-booking URL and keeps the path', () => {
    expect(
      sanitizePageLocation('https://www.saarthilife.com/manage-booking?token=TEST_SECRET_TOKEN')
    ).toBe('https://www.saarthilife.com/manage-booking');
  });

  it('keeps harmless query parameters', () => {
    expect(
      sanitizePageLocation('https://www.saarthilife.com/therapists?src=homepage')
    ).toBe('https://www.saarthilife.com/therapists?src=homepage');
  });

  it('strips only the sensitive parameters and keeps the rest', () => {
    expect(
      sanitizePageLocation('https://www.saarthilife.com/manage-booking?src=email&token=TEST_SECRET_TOKEN')
    ).toBe('https://www.saarthilife.com/manage-booking?src=email');
  });

  it('strips other credential-bearing parameters (session, key, email, signature)', () => {
    expect(
      sanitizePageLocation('https://www.saarthilife.com/x?session=abc&key=k2&email=a@b.c&sig=ff&ok=1')
    ).toBe('https://www.saarthilife.com/x?ok=1');
  });

  it('removes the fragment', () => {
    expect(sanitizePageLocation('https://www.saarthilife.com/privacy#cookies')).toBe(
      'https://www.saarthilife.com/privacy'
    );
  });

  it('handles bare paths and returns unparseable input unchanged', () => {
    expect(sanitizePageLocation('/manage-booking?token=TEST_SECRET_TOKEN')).toBe('/manage-booking');
    // A space in the host cannot be parsed as absolute or relative — unchanged.
    expect(sanitizePageLocation('https://exa mple.com/?token=x')).toBe('https://exa mple.com/?token=x');
  });
});
