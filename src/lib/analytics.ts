/**
 * Google Analytics 4 (GA4) Client-Side Tracking Utility
 * 
 * Provides safe, non-blocking telemetry helpers for Saarthi.
 * Guarantees that no PII is transmitted and analytics failures never affect business logic.
 */

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Banned PII keys that must never be sent to Google Analytics
const PII_BANNED_KEYS = new Set([
  'name',
  'fullname',
  'full_name',
  'studentname',
  'student_name',
  'parentname',
  'parent_name',
  'email',
  'emailaddress',
  'email_address',
  'phone',
  'phonenumber',
  'phone_number',
  'mobile',
  'contact',
  'contactnumber',
  'address',
  'fulladdress',
  'password',
  'token',
  'authtoken',
  'meetingurl',
  'meeting_url',
  'message',
  'notes',
  'details'
]);

/**
 * Filter out any accidental PII attributes from the parameters object.
 */
function sanitizeEventParams(params?: Record<string, unknown>): Record<string, unknown> {
  if (!params || typeof params !== 'object') {
    return {};
  }

  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const normalizedKey = key.toLowerCase().replace(/[-_\s]/g, '');
    if (PII_BANNED_KEYS.has(normalizedKey)) {
      continue;
    }

    // Only forward primitive non-sensitive types (strings, numbers, booleans)
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    }
  }

  return clean;
}

export type AnalyticsEventName =
  | 'book_demo_click'
  | 'book_demo_started'
  | 'book_demo_submitted'
  | 'contact_form_started'
  | 'contact_form_submitted'
  | 'course_viewed'
  | 'pricing_viewed'
  | (string & {});

export interface AnalyticsEventParams {
  [key: string]: unknown;
}

/**
 * Dispatches a custom GA4 event safely.
 * 
 * @param eventName - The standard GA4 event name (e.g., 'book_demo_submitted')
 * @param params - Optional non-sensitive contextual parameters
 */
export function trackEvent(eventName: AnalyticsEventName, params?: AnalyticsEventParams): void {
  try {
    // Only run on client-side
    if (typeof window === 'undefined') {
      return;
    }

    // Check if measurement ID is configured
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId) {
      return;
    }

    // Check if gtag function is initialized
    if (typeof window.gtag !== 'function') {
      return;
    }

    const sanitized = sanitizeEventParams(params);

    window.gtag('event', eventName, sanitized);
  } catch (error) {
    // Analytics failures must never interrupt user experience or throw
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[GA4 Analytics] Failed to record event:', error);
    }
  }
}
