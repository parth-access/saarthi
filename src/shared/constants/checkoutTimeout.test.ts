import { describe, it, expect } from 'vitest';
import { CHECKOUT_TIMEOUT_SECONDS, SLOT_HOLD_MS } from '.';

describe('checkout timeout vs slot hold', () => {
  it('closes checkout at least a minute before the slot hold lapses', () => {
    expect(CHECKOUT_TIMEOUT_SECONDS).toBeGreaterThan(0);
    expect(CHECKOUT_TIMEOUT_SECONDS * 1000).toBeLessThanOrEqual(SLOT_HOLD_MS - 60_000);
  });
});
