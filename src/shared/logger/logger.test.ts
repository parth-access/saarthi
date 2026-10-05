import { describe, it, expect, vi } from 'vitest';
import { Logger } from './index';

describe('Logger', () => {
  it('should log with inherited context', () => {
    const logger = new Logger({ base: true });
    const child = logger.withContext({ reqId: '123' });
    
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    
    child.info('test message');
    
    expect(consoleSpy).toHaveBeenCalled();
    const logStr = consoleSpy.mock.calls[0][0];
    const logData = JSON.parse(logStr);
    
    expect(logData.context).toEqual({ base: true, reqId: '123' });
    expect(logData.level).toBe('INFO');
    
    consoleSpy.mockRestore();
  });
});
