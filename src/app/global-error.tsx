'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-background text-text flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-surface p-8 rounded-2xl shadow-sm border border-muted">
          <h2 className="text-2xl font-semibold font-serif text-primary-ink">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. Our engineering team has been notified.
          </p>
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-deep transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
