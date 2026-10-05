import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from './logger';

describe('API logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should serialize Error objects correctly in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const error = new Error('Test production error');

    logger.error(
      'SYSTEM',
      'Something failed',
      error,
      { test: true },
      'test-request-id'
    );

    expect(consoleSpy).toHaveBeenCalledTimes(1);

    const logString = consoleSpy.mock.calls[0][0];
    const logData = JSON.parse(logString);

    expect(logData.level).toBe('error');
    expect(logData.category).toBe('SYSTEM');
    expect(logData.message).toBe('Something failed');
    expect(logData.requestId).toBe('test-request-id');

    expect(logData.error).toEqual({
      name: 'Error',
      message: 'Test production error',
      stack: expect.any(String),
      cause: undefined,
    });

    expect(logData.error).not.toEqual({});
  });
});