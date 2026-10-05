import { describe, it, expect } from 'vitest';
import { config } from './index';

describe('Config', () => {
  it('should have environment flags', () => {
    expect(typeof config.isDevelopment()).toBe('boolean');
    expect(typeof config.isProduction()).toBe('boolean');
  });

  it('should correctly parse firebase and razorpay requirements', () => {
    expect(typeof config.hasFirebaseAdmin()).toBe('boolean');
    expect(typeof config.hasRazorpay()).toBe('boolean');
  });
});
