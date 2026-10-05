'use client';

import React from 'react';
import Script from 'next/script';
import { useAnalyticsConsent } from '@/hooks/useAnalyticsConsent';
import { clearGoogleAnalyticsCookies } from '@/lib/analyticsConsent';

/**
 * Loads Google Analytics only after the visitor has accepted analytics.
 * Until then nothing is requested from Google and no GA cookies are set.
 */
export function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const consent = useAnalyticsConsent();
  const hasLoadedRef = React.useRef(false);

  React.useEffect(() => {
    if (!measurementId || consent === 'unknown') return;

    if (consent === 'granted') {
      hasLoadedRef.current = true;
      // Re-enable if the visitor previously declined in this same page view.
      (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = false;
      return;
    }

    // Declined or undecided: make sure GA is switched off and its cookies are gone
    // (this also cleans up cookies set before the consent notice existed).
    (window as unknown as Record<string, unknown>)[`ga-disable-${measurementId}`] = true;
    if (hasLoadedRef.current && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
    }
    clearGoogleAnalyticsCookies();
  }, [consent, measurementId]);

  if (!measurementId || consent !== 'granted') {
    return null;
  }

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
            gtag('config', '${measurementId}');
          `,
        }}
      />
    </>
  );
}

export default GoogleAnalytics;
