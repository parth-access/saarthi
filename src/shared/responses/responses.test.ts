import { describe, it, expect } from 'vitest';
import { successResponse, errorResponse } from './index';

// Note: Testing NextResponse outside of Next.js requires mocking or checking the interface indirectly.
// We can test that the functions return objects with the right shape if NextResponse.json is just returning an object.
describe('API Responses', () => {
  it('should be defined', () => {
    expect(successResponse).toBeDefined();
    expect(errorResponse).toBeDefined();
  });
});
