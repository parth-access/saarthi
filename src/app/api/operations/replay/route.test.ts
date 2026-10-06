import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

/**
 * POST /api/operations/replay — the one endpoint that re-drives machinery, so
 * the pins here are about what it will NOT do as much as what it will:
 * no arbitrary event names onto the bus, no unvalidated bodies, and
 * authorization through the canonical users-collection role.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 15, remaining: 14, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('@/app/api/email/emailSender', () => ({
  resendSavedEmailAction: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/domains/booking', () => ({
  firestoreBookingRepository: {
    findById: vi.fn().mockResolvedValue({ id: 'bk_1', status: 'confirmed' }),
  },
}));
vi.mock('@/shared/events/EventBus', () => ({
  EventBus: { publish: vi.fn().mockResolvedValue(undefined) },
}));

import { POST } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { resendSavedEmailAction } from '@/app/api/email/emailSender';
import { EventBus } from '@/shared/events/EventBus';
import { firestoreBookingRepository } from '@/domains/booking';
import { checkRateLimit } from '@/app/api/_lib/rateLimit';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/operations/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ success: true, limit: 15, remaining: 14, reset: 0 });
  vi.mocked(firestoreBookingRepository.findById).mockResolvedValue({
    id: 'bk_1',
    status: 'confirmed',
  } as never);
});

describe('POST /api/operations/replay', () => {
  it('blocks unauthenticated callers before touching anything', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await post({ action: 'resend_email', emailId: 'email_1' });
    expect(res.status).toBe(401);
    expect(resendSavedEmailAction).not.toHaveBeenCalled();
  });

  it('rate-limits after authorization', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(checkRateLimit).mockReturnValue({ success: false, limit: 15, remaining: 0, reset: 0 });
    const res = await post({ action: 'resend_email', emailId: 'email_1' });
    expect(res.status).toBe(429);
    expect(resendSavedEmailAction).not.toHaveBeenCalled();
  });

  it('resends a stored email by id', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await post({ action: 'resend_email', emailId: 'email_bk_1_booking-confirmed' });
    expect(res.status).toBe(200);
    expect(resendSavedEmailAction).toHaveBeenCalledWith('email_bk_1_booking-confirmed');
  });

  it('republishes an allow-listed lifecycle event for an existing booking', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const eventName of ['BookingConfirmed', 'BookingExpired']) {
      const res = await post({ action: 'replay_event', bookingId: 'bk_1', eventName });
      expect(res.status).toBe(200);
    }
    expect(EventBus.publish).toHaveBeenCalledTimes(2);
  });

  it('refuses arbitrary event names — the injection this route used to allow', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const eventName of ['PaymentCaptured', 'BookingCancelled', 'anything', '../../etc']) {
      const res = await post({ action: 'replay_event', bookingId: 'bk_1', eventName });
      expect(res.status).toBe(400);
    }
    expect(EventBus.publish).not.toHaveBeenCalled();
  });

  it('404s a replay for a booking that does not exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null as never);
    const res = await post({ action: 'replay_event', bookingId: 'bk_missing', eventName: 'BookingConfirmed' });
    expect(res.status).toBe(404);
    expect(EventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses malformed bodies without publishing', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    for (const bad of [
      { action: 'resend_email' },
      { action: 'resend_email', emailId: 42 },
      { action: 'replay_event', bookingId: 'bk_1' },
      { action: 'wipe_database' },
      'a string',
    ]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
    }
    expect(EventBus.publish).not.toHaveBeenCalled();
    expect(resendSavedEmailAction).not.toHaveBeenCalled();
  });

  it('returns an opaque 500 when the machinery throws', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    vi.mocked(resendSavedEmailAction).mockRejectedValue(new Error('resend api exploded'));
    const res = await post({ action: 'resend_email', emailId: 'email_1' });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Operation failed');
    expect(body.error).not.toContain('exploded');
  });
});
