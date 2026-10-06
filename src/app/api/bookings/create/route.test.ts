import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The create route's mapping of the bookability refusal: a deactivated
 * therapist is a state conflict (409) with the service's authored sentence —
 * not a validation error, not a 500.
 */

vi.mock('@/server/validators/bookingValidators', () => ({
  bookingSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: {
        therapistId: 'th_1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        phone: '9876543210',
        date: '2026-10-10',
        time: '10:00',
        sessionMode: 'online',
      },
    }),
  },
}));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 5, remaining: 4, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn().mockResolvedValue({ uid: 'user_1' }) }));
vi.mock('@/domains/booking', () => ({
  CreateBookingCommand: class {},
  CreateBookingCommandHandler: class {
    execute() {
      return Promise.reject(new Error('This therapist is not currently bookable.'));
    }
  },
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/bookings/create — bookability refusal mapping', () => {
  it('maps the bookability refusal to 409 with the authored sentence', async () => {
    const res = await POST(
      new Request('http://localhost/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ therapistId: 'th_1' }),
      }) as never
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('This therapist is not currently bookable.');
  });
});
