import { describe, it, expect } from 'vitest';
import {
  ACTION_SESSION_ERROR,
  ACTION_UNKNOWN_OUTCOME,
  interpretAdminActionResponse,
} from './adminBookingActionResponse';

/**
 * Reading the action endpoint's answer.
 *
 * The failure this file exists to prevent: a browser that reports "done" when the
 * server said something else. Two shapes are dangerous specifically because they
 * look benign —
 *
 *  - a `200` whose `changed` is false (the handler no-op'd), and
 *  - a `2xx` whose body is not the shape this console expects,
 *
 * and both are asserted here rather than left to the component.
 */

describe('a successful answer', () => {
  it('reports what the server said happened', () => {
    const result = interpretAdminActionResponse(200, {
      success: true,
      action: 'cancel',
      changed: true,
      summary: 'Booking cancelled.',
      details: ['The slot has been released and is bookable again.'],
    });
    expect(result).toEqual({
      ok: true,
      changed: true,
      summary: 'Booking cancelled.',
      details: ['The slot has been released and is bookable again.'],
    });
  });

  it('carries an idempotent no-op through as unchanged', () => {
    // The endpoint answers 200 for "already confirmed". Losing `changed: false`
    // here is how an operator ends up telling a client about an email that was
    // sent last week.
    const result = interpretAdminActionResponse(200, {
      success: true,
      changed: false,
      summary: 'This booking was already confirmed. Nothing was changed.',
      details: [],
    });
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it('reads an absent changed flag as unchanged', () => {
    // The safer default: a neutral report and a reload, rather than congratulating
    // an operator for a write that may not have happened.
    const result = interpretAdminActionResponse(200, { success: true, summary: 'Done.' });
    expect(result).toMatchObject({ ok: true, changed: false });
  });

  it('drops non-string details rather than rendering them', () => {
    const result = interpretAdminActionResponse(200, {
      success: true,
      changed: true,
      summary: 'Booking confirmed.',
      details: ['A real line', null, 42, '', { toString: () => 'nope' }],
    });
    expect(result).toMatchObject({ details: ['A real line'] });
  });
});

describe('a refusal', () => {
  it('shows the server sentence as written', () => {
    // `classifyActionError` already chose copy an operator can act on, from an
    // allowlist. Substituting something friendlier here would throw away the only
    // sentence that says *why*.
    const result = interpretAdminActionResponse(409, {
      success: false,
      error: 'That slot is no longer free — someone took it while this page was open.',
    });
    expect(result).toMatchObject({
      ok: false,
      error: 'That slot is no longer free — someone took it while this page was open.',
      indeterminate: false,
    });
  });

  it('treats a 401 as a session problem', () => {
    expect(interpretAdminActionResponse(401, null)).toMatchObject({
      ok: false,
      error: ACTION_SESSION_ERROR,
      indeterminate: false,
    });
  });

  it('prefers the server sentence on a 403, which a non-admin also receives', () => {
    expect(interpretAdminActionResponse(403, { error: 'Forbidden: Admin role required' })).toMatchObject({
      error: 'Forbidden: Admin role required',
    });
  });

  it('marks a bodyless 5xx as indeterminate rather than failed', () => {
    // The write may have committed before the response was lost. "Failed" invites a
    // retry, and a retry is the one thing that could double-apply.
    const result = interpretAdminActionResponse(502, '<html>Bad Gateway</html>');
    expect(result).toMatchObject({ ok: false, indeterminate: true });
    expect(result.ok === false && result.error).toBe(ACTION_UNKNOWN_OUTCOME);
  });
});

describe('an answer that cannot be read', () => {
  for (const body of [null, undefined, 'OK', [], {}, { success: true }, { success: 'yes', summary: 'x' }]) {
    it(`treats ${JSON.stringify(body) ?? 'undefined'} as an unknown outcome, not a success`, () => {
      const result = interpretAdminActionResponse(200, body);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.indeterminate).toBe(true);
    });
  }

  it('tells the operator to reload rather than to retry', () => {
    // The wording is the safety property: retrying an operation that may have
    // landed is the one action that can do damage here.
    expect(ACTION_UNKNOWN_OUTCOME).toContain('Reload');
    expect(ACTION_UNKNOWN_OUTCOME).toContain('do not retry');
  });

  it('does not report an explicit success: false as ok', () => {
    const result = interpretAdminActionResponse(200, { success: false, error: 'Nope.' });
    expect(result.ok).toBe(false);
  });
});
