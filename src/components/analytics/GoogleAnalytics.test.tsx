// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { flushSync } from 'react-dom';

/**
 * Consent lifecycle + booking-token privacy of the GoogleAnalytics component.
 *
 * Failure modes pinned here (from the consent re-enable bug and the token
 * leak):
 *  - GA never mounts without consent (unset/denied);
 *  - GA mounts exactly once on "accept" — repeated grants never duplicate the
 *    script tags;
 *  - withdraw disables GA (ga-disable flag + consent update denied + cookie
 *    cleanup) while the scripts stay mounted;
 *  - accept again in the same session resumes GA immediately (consent update
 *    granted) WITHOUT a page reload and WITHOUT re-injecting scripts;
 *  - the config inline script reports a SANITIZED page_location: a
 *    /manage-booking?token=… URL can never reach GA.
 */

const h = vi.hoisted(() => ({
  consent: { current: 'unknown' as 'unknown' | 'unset' | 'granted' | 'denied' },
}));

vi.mock('@/hooks/useAnalyticsConsent', () => ({
  useAnalyticsConsent: () => h.consent.current,
}));

vi.mock('next/script', async () => {
  const React = await import('react');
  const MockScript = (props: {
    id?: string;
    src?: string;
    dangerouslySetInnerHTML?: { __html: string };
  }) =>
    React.createElement('script', {
      id: props.id,
      src: props.src,
      'data-inline-content': props.dangerouslySetInnerHTML?.__html,
    });
  return { default: MockScript };
});

vi.mock('@/lib/analyticsConsent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analyticsConsent')>();
  return {
    ...actual,
    clearGoogleAnalyticsCookies: vi.fn(),
  };
});

import { GoogleAnalytics } from './GoogleAnalytics';
import { clearGoogleAnalyticsCookies } from '@/lib/analyticsConsent';

const MEASUREMENT_ID = 'G-6R1CSK4D3H';

function setUrl(pathWithQuery: string) {
  window.history.replaceState({}, '', pathWithQuery);
}

function countInitScripts(): number {
  return document.querySelectorAll('script#google-analytics-init').length;
}

/** Clean any script elements that may persist between tests. */
function removeInjectedScripts(): void {
  document.querySelectorAll('script#google-analytics-init, script#google-analytics-tag').forEach((el) => el.remove());
}

function initScriptContent(): string {
  return (
    document.querySelector('script#google-analytics-init')?.getAttribute('data-inline-content') ?? ''
  );
}

describe('GoogleAnalytics consent lifecycle', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  let container: HTMLElement;
  let root: Root;

  const renderGa = () => {
    act(() => {
      root.render(React.createElement(GoogleAnalytics));
    });
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = MEASUREMENT_ID;
    vi.clearAllMocks();
    h.consent.current = 'unknown';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    removeInjectedScripts();
    setUrl('/');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    removeInjectedScripts();
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = originalEnv;
  });

  it('is a no-op while the consent state is still hydrating ("unknown")', () => {
    renderGa();

    expect(countInitScripts()).toBe(0);
  });

  it('mounts nothing and disables GA when the decision exists but is "unset"', () => {
    h.consent.current = 'unset';
    renderGa();

    expect(countInitScripts()).toBe(0);
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
  });

  it('never mounts GA when consent is denied', () => {
    h.consent.current = 'denied';
    renderGa();

    expect(countInitScripts()).toBe(0);
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
  });

  it('mounts GA exactly once on accept', () => {
    h.consent.current = 'granted';
    renderGa();

    expect(countInitScripts()).toBe(1);
    expect(document.querySelectorAll('script#google-analytics-tag')).toHaveLength(1);
    expect(initScriptContent()).toContain(`gtag('config', '${MEASUREMENT_ID}'`);
  });

  it('repeated accepts do not duplicate the script tags', () => {
    h.consent.current = 'granted';
    renderGa();
    renderGa();
    renderGa();

    expect(countInitScripts()).toBe(1);
    expect(document.querySelectorAll('script#google-analytics-tag')).toHaveLength(1);
  });

  it('withdraw disables GA, pushes a denied consent update, and clears cookies', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag?: unknown }).gtag = gtag;
    document.cookie = '_ga=GA1.1.123.456';

    h.consent.current = 'granted';
    renderGa();

    h.consent.current = 'denied';
    renderGa();

    expect((window as unknown as Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(true);
    expect(gtag).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    expect(clearGoogleAnalyticsCookies).toHaveBeenCalled();
    // script tags remain mounted (no churn) but disabled
    expect(countInitScripts()).toBe(1);
  });

  it('accept again after withdraw resumes GA immediately without a reload or re-injection', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag?: unknown }).gtag = gtag;

    h.consent.current = 'granted';
    renderGa();          // accept
    h.consent.current = 'denied';
    renderGa();          // withdraw
    h.consent.current = 'granted';
    renderGa();          // accept again, same page session

    expect((window as unknown as Record<string, unknown>)[`ga-disable-${MEASUREMENT_ID}`]).toBe(false);
    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', { analytics_storage: 'granted' });
    // No duplicate scripts after the full cycle.
    expect(countInitScripts()).toBe(1);
    expect(document.querySelectorAll('script#google-analytics-tag')).toHaveLength(1);
  });

  it('repeated accept/withdraw cycles never create duplicate scripts or listeners', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag?: unknown }).gtag = gtag;

    h.consent.current = 'granted';
    renderGa();
    for (let i = 0; i < 3; i += 1) {
      h.consent.current = 'denied';
      renderGa();
      h.consent.current = 'granted';
      renderGa();
    }

    expect(countInitScripts()).toBe(1);
    const grantedUpdates = gtag.mock.calls.filter(
      ([method, , params]) =>
        method === 'consent' &&
        (params as { analytics_storage?: string }).analytics_storage === 'granted'
    );
    expect(grantedUpdates).toHaveLength(3); // one per re-accept — no accumulation
  });
});

describe('GoogleAnalytics booking-token privacy', () => {
  const originalEnv = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = MEASUREMENT_ID;
    h.consent.current = 'unknown';
    removeInjectedScripts();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    removeInjectedScripts();
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = originalEnv;
  });

  it('never sends a token-bearing page_location to GA, even when consent is granted ON the manage page', () => {
    setUrl('/manage-booking?token=TEST_SECRET_TOKEN');
    h.consent.current = 'granted';

    act(() => {
      flushSync(() => {
        root.render(React.createElement(GoogleAnalytics));
      });
    });

    const content = initScriptContent();
    expect(content).not.toContain('TEST_SECRET_TOKEN');
    expect(content).toContain('"page_location"');
    // The sanitized location is the bare path — no query string at all.
    expect(content).toContain(`"page_location":"${window.location.origin}/manage-booking"`);
  });

  it('sanitizes the location for ordinary pages too (fragments and sensitive params dropped)', () => {
    setUrl('/therapists?src=homepage');
    h.consent.current = 'granted';

    act(() => {
      root.render(React.createElement(GoogleAnalytics));
    });

    const content = initScriptContent();
    expect(content).not.toContain('token=');
    expect(content).toContain(`"page_location":"${window.location.origin}/therapists?src=homepage"`);
  });
});
