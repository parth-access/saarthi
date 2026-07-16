type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'AUDIT';

interface LogContext {
  requestId?: string;
  bookingId?: string;
  paymentId?: string;
  userId?: string;
  [key: string]: unknown;
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
      context: this.context,
      meta,
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
