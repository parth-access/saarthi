import type { ErrorEvent } from '@sentry/nextjs';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'authorization',
  'cookie',
  'cookies',
  'phone',
  'phoneNumber',
  'phone_number',
  'email',
  'emailAddress',
  'email_address',
  'card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvc',
  'meetingUrl',
  'meeting_url',
  'joinUrl',
  'join_url',
  'apiKey',
  'api_key',
  'serviceRole',
  'service_role',
  'privateKey',
  'private_key',
  'credential',
  'credentials',
  'sessionId',
  'session_id',
  'razorpay_signature',
  'razorpay_payment_id',
  'razorpay_order_id',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'jwt',
  'bearer',
]);

/**
 * Recursively scrubs sensitive key-value pairs from an object or array.
 */
export function sanitizeData(data: unknown, depth = 0): unknown {
  if (depth > 8 || data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Scrub potential JWT or bearer tokens embedded in strings
    if (/bearer\s+[a-zA-Z0-9._-]+/i.test(data)) {
      return '[FILTERED_TOKEN]';
    }
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = Array.from(SENSITIVE_KEYS).some(
      sensitiveKey => lowerKey === sensitiveKey.toLowerCase() || lowerKey.includes(sensitiveKey.toLowerCase())
    );

    if (isSensitive) {
      result[key] = '[FILTERED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeData(value, depth + 1);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sentry beforeSend hook to scrub request headers, cookies, query params, and extra contexts.
 */
export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  // Scrub request headers and cookies
  if (event.request) {
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      for (const headerKey of Object.keys(headers)) {
        const lowerHeader = headerKey.toLowerCase();
        if (
          lowerHeader === 'authorization' ||
          lowerHeader === 'cookie' ||
          lowerHeader === 'set-cookie' ||
          lowerHeader.includes('token') ||
          lowerHeader.includes('key') ||
          lowerHeader.includes('secret')
        ) {
          delete headers[headerKey];
        }
      }
      event.request.headers = headers;
    }

    if (event.request.cookies) {
      event.request.cookies = {};
    }

    if (event.request.data) {
      event.request.data = sanitizeData(event.request.data);
    }

    if (event.request.query_string && typeof event.request.query_string === 'string') {
      // Remove sensitive query params like token, key, secret
      event.request.query_string = event.request.query_string.replace(
        /(token|key|secret|password|auth|code)=[^&]+/gi,
        '$1=[FILTERED]'
      );
    }
  }

  // Scrub user context - preserve ID if non-PII, remove email/phone/username
  if (event.user) {
    const sanitizedUser: Record<string, unknown> = {};
    if (event.user.id) sanitizedUser.id = event.user.id;
    if (event.user.ip_address) sanitizedUser.ip_address = '[FILTERED]';
    event.user = sanitizedUser;
  }

  // Scrub extra context and breadcrumbs
  if (event.extra) {
    event.extra = sanitizeData(event.extra) as Record<string, unknown>;
  }

  if (event.contexts) {
    event.contexts = sanitizeData(event.contexts) as NonNullable<ErrorEvent['contexts']>;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
      if (breadcrumb.data) {
        breadcrumb.data = sanitizeData(breadcrumb.data) as Record<string, unknown>;
      }
      return breadcrumb;
    });
  }

  return event;
}
