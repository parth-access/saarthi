import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      await import('../sentry.server.config');
    } catch (err) {
      console.warn('Failed to initialize Sentry server config:', err);
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    try {
      await import('../sentry.edge.config');
    } catch (err) {
      console.warn('Failed to initialize Sentry edge config:', err);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
