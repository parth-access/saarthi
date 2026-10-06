import { describe, it, expect } from 'vitest';
import { interpretReminderSendResponse, REMINDER_TRANSPORT_ERROR } from './adminReminderResponse';

describe('interpretReminderSendResponse', () => {
  it('reads a first send', () => {
    const result = interpretReminderSendResponse(200, {
      success: true,
      alreadySent: false,
      message: 'Session reminder email dispatched successfully.',
    });
    expect(result).toMatchObject({ ok: true, alreadySent: false });
  });

  it('reads an already-sent idempotent answer as info, not success', () => {
    const result = interpretReminderSendResponse(200, {
      success: true,
      alreadySent: true,
      message: 'Reminder was already previously sent for this booking.',
    });
    expect(result.ok && result.alreadySent).toBe(true);
  });

  it('separates a skip — a known outcome — from a failure', () => {
    const skip = interpretReminderSendResponse(200, {
      success: false,
      skippedReason: 'not_yet_due',
      error: 'not_yet_due',
    });
    expect(skip).toEqual({ ok: false, skipped: true, error: 'not_yet_due', indeterminate: false });

    const failure = interpretReminderSendResponse(500, {
      success: false,
      error: 'The reminder did not go out just now.',
    });
    expect(failure.ok ? null : failure.skipped).toBe(false);
    expect(failure.ok ? null : failure.indeterminate).toBe(false);
  });

  it('treats a transport gap as indeterminate — reload, never retry', () => {
    const result = interpretReminderSendResponse(0, null);
    expect(result).toEqual({ ok: false, skipped: false, error: REMINDER_TRANSPORT_ERROR, indeterminate: true });
  });
});
