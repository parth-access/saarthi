import { describe, it, expect } from 'vitest';
import {
  interpretAdminOperationsResponse,
  interpretOperationsSearchResponse,
  GENERIC_OPERATIONS_ERROR,
  OPERATIONS_SESSION_ERROR,
} from './adminOperationsResponse';

function dashboardBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    metrics: [
      {
        date: '2026-10-06',
        bookingsCreated: 12,
        bookingsConfirmed: 3,
        paymentsSucceeded: 3,
        paymentsFailed: 1,
        emailsSent: 9,
        emailsFailed: 0,
      },
    ],
    timelines: [
      {
        id: 'tl_1',
        event: 'BookingConfirmed',
        severity: 'info',
        message: 'Booking confirmed',
        actor: { type: 'admin', id: 'uid_admin' },
        correlationId: 'corr_1',
        bookingId: 'bk_1',
        createdAt: '2026-10-06T09:00:00.000Z',
      },
    ],
    workerStatus: { queuedCount: 2, failedCount: 1, lastPoll: '2026-10-06T09:00:00.000Z', status: 'active' },
    diagnostics: {
      firebase: 'healthy',
      resend: 'healthy',
      razorpay: 'missing_credentials',
      env: 'production',
    },
    ...overrides,
  };
}

describe('interpretAdminOperationsResponse', () => {
  it('projects the real fields and drops the theatrical ones', () => {
    const result = interpretAdminOperationsResponse(200, dashboardBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Counts are read; the hardcoded 'active' status and request-time lastPoll
    // are not carried at all — the payload has nowhere to put them.
    expect(result.payload.queuedEmailCount).toBe(2);
    expect(result.payload.failedEmailCount).toBe(1);
    expect(Object.keys(result.payload)).not.toContain('workerStatus');
    expect(result.payload.diagnostics.resendConfigured).toBe(true);
    expect(result.payload.diagnostics.razorpayConfigured).toBe(false);
    expect(result.payload.diagnostics.nodeEnv).toBe('production');
  });

  it('projects timeline rows with typed actors and correlation refs', () => {
    const result = interpretAdminOperationsResponse(200, dashboardBody());
    const row = result.ok ? result.payload.timelines[0] : null;
    expect(row).toMatchObject({
      event: 'BookingConfirmed',
      severity: 'info',
      actorType: 'admin',
      correlationId: 'corr_1',
      bookingId: 'bk_1',
    });
  });

  it('accepts Firestore-Timestamp-shaped createdAt values', () => {
    const result = interpretAdminOperationsResponse(
      200,
      dashboardBody({
        timelines: [
          { id: 'tl_2', event: 'PaymentFailed', severity: 'error', message: 'x', createdAt: { seconds: 1760000000, nanoseconds: 0 } },
        ],
      })
    );
    expect(result.ok && result.payload.timelines[0]?.createdAtIso).toBe(
      new Date(1760000000 * 1000).toISOString()
    );
  });

  it('refuses non-200 responses and names session expiry', () => {
    expect(interpretAdminOperationsResponse(500, { error: 'Dashboard unavailable' })).toEqual({
      ok: false,
      error: GENERIC_OPERATIONS_ERROR,
    });
    expect(interpretAdminOperationsResponse(401, null)).toEqual({
      ok: false,
      error: OPERATIONS_SESSION_ERROR,
    });
  });
});

describe('interpretOperationsSearchResponse', () => {
  it('projects booking hits to the fields the screen shows', () => {
    const result = interpretOperationsSearchResponse(
      200,
      {
        bookings: [
          {
            id: 'bk_1',
            name: 'Asha',
            email: 'a@x.com',
            phone: '9876543210',
            status: 'confirmed',
            therapistName: 'Dr R',
            sessionType: 'Individual',
            razorpayOrderId: 'order_1',
            razorpayPaymentId: null,
            internalNotes: 'should not travel',
          },
        ],
        emails: [],
        timelines: [],
      },
      'asha'
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.bookings[0]).toEqual({
      id: 'bk_1',
      name: 'Asha',
      email: 'a@x.com',
      phone: '9876543210',
      status: 'confirmed',
      therapistName: 'Dr R',
      sessionType: 'Individual',
      razorpayOrderId: 'order_1',
      razorpayPaymentId: null,
    });
  });

  it('treats a server refusal as its sentence and a transport gap as generic', () => {
    expect(interpretOperationsSearchResponse(400, { error: 'Enter at least 3 characters to search.' }, 'ab').ok).toBe(false);
    expect(interpretOperationsSearchResponse(500, null, 'abc')).toMatchObject({ ok: false });
  });
});
