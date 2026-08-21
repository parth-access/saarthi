'use client';

import React, { useState } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function SentryExamplePage() {
  const [hasThrown, setHasThrown] = useState(false);
  const [capturedEventId, setCapturedEventId] = useState<string | null>(null);

  const handleTriggerError = () => {
    try {
      throw new Error('Sentry Example Frontend Error: Test exception triggered from /sentry-example-page');
    } catch (error) {
      const eventId = Sentry.captureException(error, {
        tags: {
          feature: 'sentry-verification',
          page: '/sentry-example-page',
        },
      });
      setCapturedEventId(eventId);
      setHasThrown(true);
      // Re-throw so standard window error handlers and Sentry automatic error tracking also catch it
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F4E8] text-[#2D3748] flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#E2E8F0] p-8 text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold font-serif text-[#2F855A]">
            Sentry Verification
          </h1>
          <p className="text-sm text-[#718096]">
            This isolated route is used to verify production error tracking and Sentry SDK integration.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            id="trigger-sentry-test-error-btn"
            onClick={handleTriggerError}
            className="w-full px-5 py-3 bg-[#E53E3E] text-white font-medium rounded-xl hover:bg-[#C53030] transition-colors shadow-sm cursor-pointer"
          >
            Trigger Sentry Test Error
          </button>
        </div>

        {hasThrown && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-left text-xs text-emerald-800 space-y-1">
            <p className="font-semibold">Event Dispatched to Sentry!</p>
            <p className="text-emerald-700">
              Event ID: <span className="font-mono">{capturedEventId || 'Captured'}</span>
            </p>
            <p className="text-emerald-600">
              Check your Sentry project issues dashboard to confirm receipt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
