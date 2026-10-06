import { describe, it, expect } from 'vitest';
import { interpretBookabilityResponse, BOOKABILITY_TRANSPORT_ERROR } from './bookabilityResponse';

describe('interpretBookabilityResponse', () => {
  it('reads a real change', () => {
    const result = interpretBookabilityResponse(200, {
      success: true,
      changed: true,
      summary: 'This therapist is no longer bookable.',
    });
    expect(result).toMatchObject({ ok: true, changed: true });
  });

  it('reads a stated no-op as info, not as a change', () => {
    const result = interpretBookabilityResponse(200, {
      success: true,
      changed: false,
      summary: 'This therapist is already bookable; nothing was written.',
    });
    expect(result.ok && result.changed).toBe(false);
  });

  it('quotes known refusals and treats transport gaps as indeterminate', () => {
    expect(interpretBookabilityResponse(404, { error: 'No therapist exists with that id.' })).toEqual({
      ok: false,
      error: 'No therapist exists with that id.',
      indeterminate: false,
    });
    expect(interpretBookabilityResponse(0, null)).toEqual({
      ok: false,
      error: BOOKABILITY_TRANSPORT_ERROR,
      indeterminate: true,
    });
  });
});
