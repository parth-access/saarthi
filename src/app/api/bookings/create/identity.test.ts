import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE identity invariant for bookings: the authenticated account and the
 * booking's client identity are two separate pieces of data. The token
 * contributes OWNERSHIP (uid); the form contributes WHO the booking is for
 * (name + email). Every client-facing email, the calendar invite, reminders,
 * the receipt and the manage-booking link derive from the persisted booking
 * email — so this boundary is where the recipient is really decided.
 *
 * The regression this pins: a signed-in therapist booking with a different
 * personal email used to receive the confirmation themselves, because this
 * route overrode the form email (and name) with the token's claims. The email
 * the person typed must reach the booking document verbatim (normalized), for
 * every combination of signed-in/none and same/different email.
 */

const captured: {
  command: { bookingData: Record<string, unknown>; userId: string; email: string } | null;
} = { command: null };

vi.mock('@/server/validators/bookingValidators', () => ({
  bookingSchema: {
    safeParse: vi.fn((body: Record<string, unknown>) => ({
      success: true,
      data: {
        therapistId: 'th_1',
        sessionType: 'individual',
        date: '2026-10-10',
        time: '10:00',
        sessionMode: 'online',
        phone: '9876543210',
        name: 'Form Name',
        email: 'form@example.com',
        ...body,
      },
    })),
  },
}));
vi.mock('@/app/api/_lib/rateLimit', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ success: true, limit: 5, remaining: 4, reset: 0 }),
  getClientIp: vi.fn().mockReturnValue('test-client-ip'),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
}));
vi.mock('@/domains/booking', () => ({
  CreateBookingCommand: class {
    constructor(
      public bookingData: Record<string, unknown>,
      public userId: string,
      public email: string
    ) {
      captured.command = this;
    }
  },
  CreateBookingCommandHandler: class {
    execute() {
      return Promise.resolve({ bookingId: 'bk_1', orderId: 'order_1', amount: 1500, currency: 'INR' });
    }
  },
}));

import { POST } from './route';
import { adminAuth } from '@/lib/firebase/admin';

beforeEach(() => {
  vi.clearAllMocks();
  captured.command = null;
});

function createRequest(body: Record<string, unknown>, token?: string) {
  return new Request('http://localhost/api/bookings/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as never;
}

async function createBooking(body: Record<string, unknown>, auth?: { uid: string; email: string; name?: string }) {
  if (auth) {
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue(auth as never);
  }
  const res = await POST(createRequest(body, auth ? 'id-token' : undefined));
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/bookings/create — booking client identity vs authenticated identity', () => {
  it('CASE B (the regression): a signed-in therapist booking with a different personal email books THAT email', async () => {
    const { res } = await createBooking(
      { name: 'Personal Person', email: 'Personal@Example.com' },
      { uid: 'therapist_uid', email: 'therapist@example.com', name: 'Dr Login Name' }
    );

    expect(res.status).toBe(201);
    expect(captured.command).not.toBeNull();
    expect(captured.command?.bookingData.email).toBe('personal@example.com');
    expect(captured.command?.email).toBe('personal@example.com');
    // The login identity is nowhere in the booking's client identity — not as
    // email, not as name.
    expect(JSON.stringify(captured.command?.bookingData)).not.toContain('therapist@example.com');
    expect(JSON.stringify(captured.command?.bookingData)).not.toContain('Dr Login Name');
  });

  it('CASE A: a signed-in client booking with their own account email is unchanged', async () => {
    await createBooking(
      { name: 'Client Person', email: 'client@example.com' },
      { uid: 'client_uid', email: 'client@example.com', name: 'Client Person' }
    );

    expect(captured.command?.bookingData.email).toBe('client@example.com');
    expect(captured.command?.userId).toBe('client_uid');
  });

  it('CASE E: a signed-in client who changes the email field books the new email', async () => {
    await createBooking(
      { name: 'Client Person', email: 'new@example.com' },
      { uid: 'client_uid', email: 'old@example.com', name: 'Client Person' }
    );

    expect(captured.command?.bookingData.email).toBe('new@example.com');
    expect(JSON.stringify(captured.command?.bookingData)).not.toContain('old@example.com');
  });

  it('CASE C: a guest booking uses the form email and no account', async () => {
    await createBooking({ name: 'Guest Person', email: 'guest@example.com' });

    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
    expect(captured.command?.bookingData.email).toBe('guest@example.com');
    expect(captured.command?.userId).toBe('guest');
  });

  it('CASE D: a signed-in therapist booking for themselves with their own email works unchanged', async () => {
    await createBooking(
      { name: 'Dr Therapist', email: 'therapist@example.com' },
      { uid: 'therapist_uid', email: 'therapist@example.com', name: 'Dr Therapist' }
    );

    expect(captured.command?.bookingData.email).toBe('therapist@example.com');
  });

  it('keeps ownership on the authenticated account while identity stays with the form', async () => {
    await createBooking(
      { name: 'Personal Person', email: 'personal@example.com' },
      { uid: 'therapist_uid', email: 'therapist@example.com' }
    );

    // Ownership (uid) and identity (email) are deliberately different fields.
    expect(captured.command?.userId).toBe('therapist_uid');
    expect(captured.command?.bookingData.email).toBe('personal@example.com');
  });

  it('normalizes the form email casing and whitespace before persisting it', async () => {
    await createBooking({ name: '  Personal Person  ', email: '  PERSONAL@Example.COM ' });

    expect(captured.command?.bookingData.email).toBe('personal@example.com');
    expect(captured.command?.bookingData.name).toBe('Personal Person');
  });

  it('still answers 201 with the payment order for the created booking', async () => {
    const { res, body } = await createBooking(
      { name: 'Personal Person', email: 'personal@example.com' },
      { uid: 'therapist_uid', email: 'therapist@example.com' }
    );

    expect(res.status).toBe(201);
    expect(body.bookingId).toBe('bk_1');
    expect(body.orderId).toBe('order_1');
  });
});
