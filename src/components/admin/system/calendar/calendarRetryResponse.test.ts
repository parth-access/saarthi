import { describe, it, expect } from 'vitest';
import { interpretCalendarRetryResponse, RETRY_TRANSPORT_ERROR } from './calendarRetryResponse';

describe('interpretCalendarRetryResponse', () => {
  it('reads a created outcome', () => {
    const result = interpretCalendarRetryResponse(200, {
      success: true,
      outcome: 'created',
      message: 'Google Calendar event & Meet conference successfully created.',
      meetingUrl: 'https://meet.google.com/x',
    });
    expect(result).toMatchObject({ ok: true, outcome: 'created', meetingUrl: 'https://meet.google.com/x' });
  });

  it('reads an already-exists outcome as a distinct, non-success-toned fact', () => {
    const result = interpretCalendarRetryResponse(200, {
      success: true,
      outcome: 'already_exists',
      message: 'A Google Calendar event and Meet link already exist for this session.',
      meetingUrl: 'https://meet.google.com/x',
    });
    expect(result.ok && result.outcome).toBe('already_exists');
  });

  it('passes the server sentence through on a known refusal', () => {
    const result = interpretCalendarRetryResponse(409, {
      success: false,
      error: 'Booking status is pending, expected confirmed',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Booking status is pending, expected confirmed',
      indeterminate: false,
    });
  });

  it('treats the fixed 500 sentence as known, not unknown', () => {
    const result = interpretCalendarRetryResponse(500, {
      success: false,
      error: 'The calendar retry did not succeed just now. The booking records what happened — reload the list to read it.',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.indeterminate).toBe(false);
  });

  it('treats a transport failure as indeterminate — reload, never retry', () => {
    expect(interpretCalendarRetryResponse(500, null)).toEqual({
      ok: false,
      error: RETRY_TRANSPORT_ERROR,
      indeterminate: true,
    });
    const result = interpretCalendarRetryResponse(0, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.indeterminate).toBe(true);
  });
});
