import * as Sentry from '@sentry/nextjs';
import { sanitizeData } from '@/shared/sentry/sanitize';

export interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'BOOKING' | 'UI' | 'AUTH' | 'SYSTEM';
  message: string;
  data?: unknown;
  error?: unknown;
}

function writeFrontendLog(entry: FrontendLogEntry) {
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (isDev) {
    const styles = {
      info: 'color: #0ea5e9; font-weight: bold;',
      warn: 'color: #eab308; font-weight: bold;',
      error: 'color: #ef4444; font-weight: bold;',
      success: 'color: #22c55e; font-weight: bold;',
    };

    const prefix = `%c[${entry.category}]`;
    
    if (entry.level === 'error') {
      console.error(prefix, styles[entry.level], entry.message, entry.data || '', entry.error || '');
    } else if (entry.level === 'warn') {
      console.warn(prefix, styles[entry.level], entry.message, entry.data || '');
    } else if (entry.level === 'success') {
      console.log(prefix, styles[entry.level], entry.message, entry.data || '');
    } else {
      console.info(prefix, styles[entry.level], entry.message, entry.data || '');
    }
  } else {
    if (entry.level === 'error') {
       console.error(`[${entry.category}] ${entry.message}`, entry.error || '');
    }
  }

  if (entry.level === 'error') {
    try {
      const sanitizedData = sanitizeData(entry.data) as Record<string, unknown>;
      Sentry.withScope((scope) => {
        scope.setTag('category', entry.category);
        if (sanitizedData) {
          scope.setExtra('data', sanitizedData);
        }
        if (entry.error instanceof Error) {
          Sentry.captureException(entry.error);
        } else if (entry.error) {
          Sentry.captureException(new Error(String(entry.error)));
        } else {
          Sentry.captureMessage(`[${entry.category}] ${entry.message}`, 'error');
        }
      });
    } catch {
      // Safe fallback - logging must never crash the application
    }
  }
}

export const logger = {
  info: (category: FrontendLogEntry['category'], message: string, data?: unknown) => {
    writeFrontendLog({ level: 'info', category, message, data });
  },
  warn: (category: FrontendLogEntry['category'], message: string, data?: unknown) => {
    writeFrontendLog({ level: 'warn', category, message, data });
  },
  error: (category: FrontendLogEntry['category'], message: string, error?: unknown, data?: unknown) => {
    writeFrontendLog({ level: 'error', category, message, error, data });
  },
  success: (category: FrontendLogEntry['category'], message: string, data?: unknown) => {
    writeFrontendLog({ level: 'success', category, message, data });
  }
};
