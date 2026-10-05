'use client';

import React from 'react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/Button';
import { useAnalyticsConsent } from '@/hooks/useAnalyticsConsent';
import { onOpenConsentPreferences, saveConsent } from '@/lib/analyticsConsent';

/**
 * Small, non-blocking notice asking whether we may use Google Analytics.
 * Shown once (until the visitor chooses) and reopenable from the footer.
 * "Accept" and "No thanks" are deliberately identical in size and weight.
 * Essential cookies (login session) don't need consent and aren't covered here.
 */
export function CookieConsent() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const consent = useAnalyticsConsent();
  const [reopened, setReopened] = React.useState(false);
  const regionRef = React.useRef<HTMLElement>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(
    () =>
      onOpenConsentPreferences(() => {
        openerRef.current = document.activeElement as HTMLElement | null;
        setReopened(true);
      }),
    []
  );

  // When opened on purpose (footer link), move focus here. Never when it appears on its own.
  React.useEffect(() => {
    if (reopened) regionRef.current?.focus();
  }, [reopened]);

  const close = React.useCallback(() => {
    setReopened(false);
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && opener.isConnected) opener.focus?.();
  }, []);

  React.useEffect(() => {
    if (!reopened) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [reopened, close]);

  // Nothing to ask about unless analytics is actually configured.
  if (!measurementId || consent === 'unknown') return null;
  if (consent !== 'unset' && !reopened) return null;

  const choose = (value: 'granted' | 'denied') => {
    saveConsent(value);
    close();
  };

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      role="region"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none"
    >
      <div className="mx-auto max-w-xl rounded-2xl border border-primary/10 bg-white p-5 shadow-lg">
        <h2 id="cookie-consent-title" className="font-serif text-base font-semibold text-primary">
          Help us improve Saarthi?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          With your permission we use Google Analytics to see which pages are useful. It sets cookies
          and does not include your name, contact details or anything you write to us. Saying no
          changes nothing about how the site works.{' '}
          <Link
            href="/privacy#cookies"
            className="font-medium text-primary underline underline-offset-4 hover:text-accent focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            How we use cookies
          </Link>
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => choose('granted')}
            className={buttonVariants({ variant: 'outline' }) + ' sm:flex-1'}
          >
            Accept analytics
          </button>
          <button
            type="button"
            onClick={() => choose('denied')}
            className={buttonVariants({ variant: 'outline' }) + ' sm:flex-1'}
          >
            No thanks
          </button>
        </div>
      </div>
    </section>
  );
}

export default CookieConsent;
