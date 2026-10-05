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
  'bookingtoken',
  'meetingurl',
  'meeting_url',
  'message',
  'notes',
  'details'
]);

/**
 * Query parameter names that must never survive into an analytics page
 * location: they carry credentials or personal data (booking-management
 * tokens, session tokens, contact details).
 */
const SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'bookingtoken',
  'booking_token',
  't',
  'auth',
  'authuser',
  'key',
  'apikey',
  'api_key',
  'password',
  'session',
  'sessionid',
  'session_id',
  'sid',
  'email',
  'phone',
  'name',
  'code',
  'sig',
  'signature',
]);

/** True when a query parameter name is on the sensitive denylist. */
export function isSensitiveQueryParam(name: string): boolean {
  return SENSITIVE_QUERY_PARAMS.has(name.toLowerCase().replace(/[-_\s]/g, ''));
}

/**
 * Builds a page_location that is safe to send to Google Analytics: the origin
 * and path are kept, any sensitive query parameter is dropped, harmless
 * parameters are preserved, and the fragment is removed.
 *
 * This is applied at the GA config boundary so the default config `page_view`
 * (and any hit that reports a page location) can never carry, for example, a
 * `/manage-booking?token=…` credential. The primary defence is that the
 * manage-booking flow scrubs the token from the address bar the moment it is
 * consumed; this is the second layer, applied inside analytics itself.
 */
export function sanitizePageLocation(rawLocation: string): string {
  const scrub = (url: URL, keepOrigin: boolean): string => {
    for (const name of Array.from(url.searchParams.keys())) {
      if (isSensitiveQueryParam(name)) {
        url.searchParams.delete(name);
      }
    }
    const suffix = url.search || '';
    return keepOrigin ? url.origin + url.pathname + suffix : url.pathname + suffix;
  };

  try {
    // Absolute URL (window.location.href, full link, …)
    return scrub(new URL(rawLocation), true);
  } catch {
    // fall through to relative handling
  }

  try {
    // Relative URL (e.g. an SPA path passed as an event parameter)
    return scrub(new URL(rawLocation, 'https://saarthi.invalid'), false);
  } catch {
    return rawLocation;
  }
}

/**
 * The current page location, sanitized via {@link sanitizePageLocation}.
 * Returns undefined off-client (SSR) — callers must omit the field then.
 */
export function getSanitizedPageLocation(): string | undefined {
  if (typeof window === 'undefined' || !window.location) return undefined;
  return sanitizePageLocation(window.location.href);
}

/**
 * Scrubs credential-bearing values. If a string value looks like a URL that
 * carries a token (e.g. `/manage-booking?token=SECRET`), the sensitive parts
 * are removed before anything is handed to GA.
 */
function sanitizeValue(value: string): string {
  if (/[?#&]/.test(value) && /token/i.test(value)) {
    return sanitizePageLocation(value);
  }
  return value;
}

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
      clean[key] = typeof value === 'string' ? sanitizeValue(value) : value;
    }
  }

  return clean;
}

export type AnalyticsEventName =
  | 'booking_flow_started'
  | 'booking_confirmed'
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
