import * as Sentry from '@sentry/nextjs';
import { sanitizeData } from '../sentry/sanitize';

type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'AUDIT';

interface LogContext {
  requestId?: string;
  bookingId?: string;
  paymentId?: string;
  userId?: string;
  [key: string]: unknown;
}

function serializeError(err: unknown, seen = new WeakSet()): unknown {
  if (err === null || err === undefined) {
    return err;
  }

  if (typeof err !== 'object' && typeof err !== 'function') {
    return err;
  }

  if (seen.has(err as object)) {
    return '[Circular]';
  }
  seen.add(err as object);

  if (err instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause ? serializeError(err.cause, seen) : undefined,
    };

    for (const key of Object.getOwnPropertyNames(err)) {
      if (!['name', 'message', 'stack', 'cause'].includes(key)) {
        try {
          const val = (err as unknown as Record<string, unknown>)[key];
          errorObj[key] = serializeError(val, seen);
        } catch {
          // ignore
        }
      }
    }
    return errorObj;
  }

  if (Array.isArray(err)) {
    return err.map((item) => serializeError(item, seen));
  }

  const plainObj: Record<string, unknown> = {};
  for (const key of Object.keys(err)) {
    try {
      const val = (err as unknown as Record<string, unknown>)[key];
      plainObj[key] = serializeError(val, seen);
    } catch {
      // ignore
    }
  }
  return plainObj;
}

export class Logger {
  private context: LogContext = {};

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  public withContext(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }

  private log(level: LogLevel, message: string, meta?: unknown) {
    const timestamp = new Date().toISOString();
    const payload = {
      timestamp,
      level,
      message,
      context: serializeError(this.context),
      meta: serializeError(meta),
    };
    
    // In production, this would go to a logging service or be formatted as structured JSON
    const logStr = JSON.stringify(payload);
    
    switch (level) {
      case 'TRACE':
      case 'DEBUG':
        console.debug(logStr);
        break;
      case 'INFO':
      case 'AUDIT':
        console.info(logStr);
        break;
      case 'WARN':
        console.warn(logStr);
        break;
      case 'ERROR':
      case 'FATAL':
        console.error(logStr);
        break;
    }

    if (level === 'ERROR' || level === 'FATAL') {
      try {
        const sanitizedContext = sanitizeData(this.context) as Record<string, unknown>;
        const sanitizedMeta = sanitizeData(meta);

        Sentry.withScope((scope) => {
          scope.setLevel(level === 'FATAL' ? 'fatal' : 'error');
          if (this.context.bookingId) scope.setTag('bookingId', String(this.context.bookingId));
          if (this.context.requestId) scope.setTag('requestId', String(this.context.requestId));
          if (this.context.paymentId) scope.setTag('paymentId', String(this.context.paymentId));
          if (this.context.userId) scope.setUser({ id: String(this.context.userId) });
          if (sanitizedContext && typeof sanitizedContext === 'object') {
            scope.setContext('logger_context', sanitizedContext);
          }
          if (sanitizedMeta) {
            scope.setExtra('meta', sanitizedMeta);
          }

          if (meta instanceof Error) {
            Sentry.captureException(meta);
          } else if (
            meta &&
            typeof meta === 'object' &&
            'error' in meta &&
            (meta as Record<string, unknown>).error instanceof Error
          ) {
            Sentry.captureException((meta as Record<string, unknown>).error);
          } else {
            Sentry.captureMessage(message, level === 'FATAL' ? 'fatal' : 'error');
          }
        });
      } catch {
        // Safe fallback - logging must never crash the application
      }
    }
  }

  public trace(message: string, meta?: unknown) { this.log('TRACE', message, meta); }
  public debug(message: string, meta?: unknown) { this.log('DEBUG', message, meta); }
  public info(message: string, meta?: unknown) { this.log('INFO', message, meta); }
  public warn(message: string, meta?: unknown) { this.log('WARN', message, meta); }
  public error(message: string, meta?: unknown) { this.log('ERROR', message, meta); }
  public fatal(message: string, meta?: unknown) { this.log('FATAL', message, meta); }
  public audit(message: string, meta?: unknown) { this.log('AUDIT', message, meta); }
}

export const logger = new Logger();
