'use client';

import React from 'react';
import Script from 'next/script';
import { useAnalyticsConsent } from '@/hooks/useAnalyticsConsent';
import { clearGoogleAnalyticsCookies } from '@/lib/analyticsConsent';
import { getSanitizedPageLocation } from '@/lib/analytics';

/**
 * Loads Google Analytics only after the visitor has accepted analytics.
 * Until then nothing is requested from Google and no GA cookies are set.
 *
 * Lifecycle (same-page consent changes):
 *  - first "Accept": the gtag scripts mount and `gtag('config')` runs, with a
 *    SANITIZED page_location (sensitive query params such as booking tokens are
 *    stripped — see sanitizePageLocation).
 *  - withdraw / "No thanks": GA is switched off via `ga-disable-*`, consent is
 *    updated to denied, and GA cookies are cleared. The script tags STAY
 *    mounted so nothing is ever re-injected.
 *  - accept again in the same page session: `ga-disable-*` is cleared and
 *    consent is updated back to granted, which makes GA resume immediately —
 *    no page reload, no duplicate script injection.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const consent = useAnalyticsConsent();
  const initializedRef = React.useRef(false);
  const [scriptsMounted, setScriptsMounted] = React.useState(false);

  React.useEffect(() => {
    if (!measurementId || consent === 'unknown') return;
    const disableFlag = `ga-disable-${measurementId}` as keyof Window;
    const win = window as unknown as Record<string, unknown>;

    if (consent === 'granted') {
      win[disableFlag] = false;

      if (initializedRef.current && typeof window.gtag === 'function') {
        // GA already ran in this page session (withdraw → accept again):
        // flip consent back to granted so measurement resumes immediately,
        // without a reload and without injecting the scripts a second time.
        window.gtag('consent', 'update', { analytics_storage: 'granted' });
      }
      initializedRef.current = true;
      setScriptsMounted(true);
      return;
    }

    // Declined or undecided: make sure GA is switched off and its cookies are
    // gone (this also cleans up cookies set before the consent notice existed).
    win[disableFlag] = true;
    if (initializedRef.current && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
    }
    clearGoogleAnalyticsCookies();
  }, [consent, measurementId]);

  if (!measurementId || !scriptsMounted) {
    return null;
  }

  // Sanitized at the boundary: the default config page_view reports
  // page_location, so it must never be the raw token-bearing URL.
  const configParams = JSON.stringify({
    page_location: getSanitizedPageLocation(),
  }).replace(/</g, '\\u003c');

  return (
    <>
      <Script
        id="google-analytics-tag"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script
        id="google-analytics-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}', ${configParams});
          `,
        }}
      />
    </>
  );
}

export default GoogleAnalytics;
