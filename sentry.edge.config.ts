import * as Sentry from '@sentry/nextjs';
import { sanitizeSentryEvent } from './src/shared/sentry/sanitize';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  environment:
    process.env.VERCEL_ENV ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.NODE_ENV ||
    'development',
  release:
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.npm_package_version,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  sendDefaultPii: false,
  beforeSend(event) {
    return sanitizeSentryEvent(event);
  },
});
