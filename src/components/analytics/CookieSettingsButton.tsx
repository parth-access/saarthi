'use client';

import React from 'react';
import { openConsentPreferences } from '@/lib/analyticsConsent';

/** Footer link to review or change the analytics choice. Hidden when analytics isn't configured. */
export function CookieSettingsButton({ className }: { className?: string }) {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return null;
  return (
    <button type="button" onClick={openConsentPreferences} className={className}>
      Cookie settings
    </button>
  );
}

export default CookieSettingsButton;
