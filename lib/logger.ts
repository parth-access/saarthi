import { v4 as uuidv4 } from 'uuid';
import * as Sentry from "@sentry/node";
import { env } from './env.js';

// Initialize Sentry
if (env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 1.0,
  });
}

export interface LogMetadata {
  requestId?: string;
  endpoint?: string;
  bookingId?: string;
  userEmail?: string;
  userId?: string;
  [key: string]: any;
}

class Logger {
  private format(level: string, message: string, meta: LogMetadata = {}) {
    const timestamp = new Date().toISOString();
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  }

  info(message: string, meta: LogMetadata = {}) {
    console.log(this.format('INFO', message, meta));
  }

  warn(message: string, meta: LogMetadata = {}) {
    console.warn(this.format('WARN', message, meta));
  }

  error(message: string, meta: LogMetadata = {}, error?: any) {
    const errorDetails = error ? {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    } : {};

    console.error(this.format('ERROR', message, {
      ...meta,
      ...errorDetails,
    }));

    if (error && env.VITE_SENTRY_DSN) {
      Sentry.withScope((scope) => {
        scope.setExtras(meta);
        Sentry.captureException(error);
      });
    }
  }
}

export const logger = new Logger();

// Helper to wrap API handlers with requestId and standard logging
export function withProductionHarden(handler: any) {
  return async (req: any, res: any) => {
    const requestId = uuidv4();
    const startTime = Date.now();
    const endpoint = req.url;

    // Attach requestId to req for downstream usage
    req.requestId = requestId;

    // Standard security headers
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src *; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;");

    try {
      logger.info(`Incoming request: ${req.method} ${endpoint}`, { requestId, endpoint });
      
      const result = await handler(req, res);

      const duration = Date.now() - startTime;
      if (duration > 500) {
        logger.warn(`Slow request detected: ${req.method} ${endpoint}`, { requestId, duration, endpoint });
      }

      return result;
    } catch (err) {
      logger.error(`Unhandled error in ${endpoint}`, { requestId, endpoint }, err);
      // Let the centralized handleError handle the response
      throw err; 
    }
  };
}
