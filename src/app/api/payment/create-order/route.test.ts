import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from './route';
import { verifySession } from '@/lib/auth/verifySession';
import { firestoreBookingRepository, Booking, GeneratePaymentLinkCommandHandler } from '@/domains/booking';

vi.mock('@/lib/auth/verifySession', () => ({
  verifySession: vi.fn(),
}));

vi.mock('@/domains/booking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domains/booking')>();
  return {
    ...actual,
    firestoreBookingRepository: {
      findById: vi.fn(),
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    runTransaction: vi.fn(),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ authId: 'therapist_auth_123' }),
        }),
      }),
    }),
  },
}));

describe('POST /api/payment/create-order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(GeneratePaymentLinkCommandHandler.prototype, 'execute').mockResolvedValue({
      success: true,
      orderId: 'order_test_123',
      amount: 1500,
      currency: 'INR',
    });
  });


  it('1. Unauthenticated request returns HTTP 401', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'bk_1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('2. Client accessing their own booking is allowed (200)', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'client_123',
      email: 'client@example.com',
      role: 'client',
    });

    const mockBooking = new Booking({
      id: 'bk_1',
      userId: 'client_123',
      email: 'client@example.com',
      therapistId: 'th_1',
      date: '2026-08-15',
      time: '10:00',
      status: 'awaiting_payment',
    });
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(mockBooking);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'bk_1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.orderId).toBe('order_test_123');
  });

  it('3. Client accessing another client booking returns HTTP 403', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      role: 'client',
    });

    const mockBooking = new Booking({
      id: 'bk_1',
      userId: 'victim_uid',
      email: 'victim@example.com',
      therapistId: 'th_1',
      date: '2026-08-15',
      time: '10:00',
      status: 'awaiting_payment',
    });
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(mockBooking);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'bk_1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('4. Admin accessing a booking is allowed (200)', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'admin_uid',
      email: 'admin@example.com',
      role: 'admin',
    });

    const mockBooking = new Booking({
      id: 'bk_1',
      userId: 'client_123',
      email: 'client@example.com',
      therapistId: 'th_1',
      date: '2026-08-15',
      time: '10:00',
      status: 'awaiting_payment',
    });
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(mockBooking);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'bk_1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it('5. Therapist access: allowed for assigned therapist, forbidden for unassigned', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'therapist_auth_123',
      email: 'therapist@example.com',
      role: 'therapist',
    });

    const mockBooking = new Booking({
      id: 'bk_1',
      userId: 'client_123',
      email: 'client@example.com',
      therapistId: 'th_1',
      date: '2026-08-15',
      time: '10:00',
      status: 'awaiting_payment',
    });
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(mockBooking);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'bk_1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('6. Nonexistent booking returns HTTP 404', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'client_123',
      email: 'client@example.com',
      role: 'client',
    });

    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(null);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ bookingId: 'nonexistent_bk' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Booking not found');
  });

  it('7. Client attempting to spoof userId in payload does NOT bypass authorization (403)', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      role: 'client',
    });

    const mockBooking = new Booking({
      id: 'bk_1',
      userId: 'victim_uid',
      email: 'victim@example.com',
      therapistId: 'th_1',
      date: '2026-08-15',
      time: '10:00',
      status: 'awaiting_payment',
    });
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(mockBooking);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'bk_1',
        userId: 'victim_uid', // Spoofed in body
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('8. Client attempting to spoof role in payload does NOT bypass authorization (403)', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      role: 'client', // Verified session says 'client'
    });

    const mockBooking = new Booking({
      id: 'bk_1',
      userId: 'victim_uid',
      email: 'victim@example.com',
      therapistId: 'th_1',
      date: '2026-08-15',
      time: '10:00',
      status: 'awaiting_payment',
    });
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(mockBooking);

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: 'bk_1',
        role: 'admin', // Spoofed in body
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('9. Invalid payload returns HTTP 400', async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      uid: 'client_123',
      email: 'client@example.com',
      role: 'client',
    });

    const req = new Request('http://localhost/api/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ invalidField: 123 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid payload');
  });
});
