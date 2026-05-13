export interface FrontendLogEntry {
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'BOOKING' | 'UI' | 'AUTH' | 'SYSTEM';
  message: string;
  data?: any;
  error?: any;
}

function writeFrontendLog(entry: FrontendLogEntry) {
  const isDev = import.meta.env.DEV;
  
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
    // In production, we might want to send this to a logging service, but for now we'll just log stringified errors safely.
    if (entry.level === 'error') {
       console.error(`[${entry.category}] ${entry.message}`, entry.error || '');
    }
  }
}

export const logger = {
  info: (category: FrontendLogEntry['category'], message: string, data?: any) => {
    writeFrontendLog({ level: 'info', category, message, data });
  },
  warn: (category: FrontendLogEntry['category'], message: string, data?: any) => {
    writeFrontendLog({ level: 'warn', category, message, data });
  },
  error: (category: FrontendLogEntry['category'], message: string, error?: any, data?: any) => {
    writeFrontendLog({ level: 'error', category, message, error, data });
  },
  success: (category: FrontendLogEntry['category'], message: string, data?: any) => {
    writeFrontendLog({ level: 'success', category, message, data });
  }
};
