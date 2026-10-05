import { describe, it, expect } from 'vitest';
import { AppError, ValidationError } from './index';

describe('Errors Hierarchy', () => {
  it('AppError should set base properties correctly', () => {
    const error = new AppError('Something failed', 'TEST_ERROR', 500, true, { test: 123 });
    expect(error.message).toBe('Something failed');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.metadata).toEqual({ test: 123 });
  });

  it('ValidationError should default to 400', () => {
    const error = new ValidationError('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
