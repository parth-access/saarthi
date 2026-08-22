export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'success';

  category:
    | 'BOOKING'
    | 'EMAIL'
    | 'FIRESTORE'
    | 'AUTH'
    | 'MANAGE_BOOKING'
    | 'SYSTEM'
    | 'THERAPIST_MUTATION'
    | 'PAYMENT'
    | 'THERAPIST_AUTH'
    | 'THERAPIST_AUTH2'
    | 'CALENDAR'
    | 'ADMIN_CALENDAR'
    | 'JOIN_SESSION'
    | 'REMINDER'
    | 'ADMIN_REMINDER'
    | 'CRON'
    | 'REVIEWS_API'
    | 'REVIEW'
    | 'LIFECYCLE';

  message: string;
  data?: unknown;
  error?: unknown;
  requestId?: string;
  timestamp: string;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    };
  }

  return err;
}

function formatLog(entry: LogEntry) {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const colors = {
      info: '\x1b[36m', // cyan
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
      success: '\x1b[32m', // green
      reset: '\x1b[0m',
    };

    let msg = `${colors[entry.level]}[${entry.category}] ${entry.message}${colors.reset}`;

    if (entry.data) {
      msg += ` \n  Data: ${JSON.stringify(entry.data, null, 2)}`;
    }

    if (entry.error) {
      msg += ` \n  Error: ${
        entry.error instanceof Error
          ? entry.error.stack || entry.error.message
          : JSON.stringify(entry.error)
      }`;
    }

    return msg;
  }

  // Production: JSON log
  return JSON.stringify({
    ...entry,
    error: entry.error ? serializeError(entry.error) : undefined,
  });
}

function writeLog(entry: LogEntry) {
  const formatted = formatLog(entry);

  if (entry.level === 'error') {
    console.error(formatted);
  } else if (entry.level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

export const logger = {
  info: (
    category: LogEntry['category'],
    message: string,
    data?: unknown,
    requestId?: string
  ) => {
    writeLog({
      level: 'info',
      category,
      message,
      data,
      requestId,
      timestamp: new Date().toISOString(),
    });
  },

  warn: (
    category: LogEntry['category'],
    message: string,
    data?: unknown,
    requestId?: string
  ) => {
    writeLog({
      level: 'warn',
      category,
      message,
      data,
      requestId,
      timestamp: new Date().toISOString(),
    });
  },

  error: (
    category: LogEntry['category'],
    message: string,
    error?: unknown,
    data?: unknown,
    requestId?: string
  ) => {
    writeLog({
      level: 'error',
      category,
      message,
      error,
      data,
      requestId,
      timestamp: new Date().toISOString(),
    });
  },

  success: (
    category: LogEntry['category'],
    message: string,
    data?: unknown,
    requestId?: string
  ) => {
    writeLog({
      level: 'success',
      category,
      message,
      data,
      requestId,
      timestamp: new Date().toISOString(),
    });
  },
};