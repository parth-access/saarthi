import * as Sentry from '@sentry/nextjs';
import { sanitizeSentryEvent } from '@/shared/sentry/sanitize';

/*
 * Browser Sentry setup. Next.js 15.3+ loads src/instrumentation-client.ts on the
 * client automatically; @sentry/nextjs v9+ no longer injects sentry.client.config.ts.
 */

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.VERCEL_ENV ||
      process.env.SENTRY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development',
    release:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications.',
      'ResizeObserver loop limit exceeded',
      'Network request failed',
      'AbortError',
    ],
  });
}

// Lets Sentry trace client-side navigations between pages.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
