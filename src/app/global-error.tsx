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
      <body className="antialiased min-h-screen bg-[#F7F4E8] text-[#2D3748] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl shadow-sm border border-[#E2E8F0]">
          <h2 className="text-2xl font-bold font-serif text-[#2F855A]">Something went wrong</h2>
          <p className="text-sm text-[#718096]">
            An unexpected error occurred. Our engineering team has been notified.
          </p>
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-[#2F855A] text-white rounded-lg text-sm font-medium hover:bg-[#276749] transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
