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
      <body className="antialiased min-h-screen bg-[#FFFBE7] text-[#1A1A1A] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl shadow-sm border border-primary/10">
          <h2 className="text-2xl font-bold font-serif text-[#1F5E3B]">Something went wrong</h2>
          <p className="text-sm text-[#4B5563]">
            An unexpected error occurred. Our engineering team has been notified.
          </p>
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-[#1F5E3B] text-white rounded-lg text-sm font-medium hover:bg-[#17492E] transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
