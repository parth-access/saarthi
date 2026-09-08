import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { verifySession } from '@/lib/auth/verifySession';
import { BookingService } from '@/server/services/BookingService';

const mocks = vi.hoisted(() => ({
  getTherapist: vi.fn(),
}));

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }));
vi.mock('@/server/services/BookingService', () => ({
  BookingService: { getBookings: vi.fn(), getBookingsByTherapist: vi.fn() },
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({ get: mocks.getTherapist })),
      })),
    })),
  },
}));
vi.mock('@/app/api/_lib/logger', () => ({
  logger: { error: vi.fn() },
}));

const THERAPIST_SESSION = { uid: 'auth_uid_priya', role: 'therapist' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySession).mockResolvedValue(THERAPIST_SESSION);
  mocks.getTherapist.mockResolvedValue({ empty: false, docs: [{ id: 'therapist_priya' }] });
  vi.mocked(BookingService.getBookingsByTherapist).mockResolvedValue([]);
});

describe('GET /api/bookings', () => {
  it('uses the authenticated therapist profile id, not the Firebase Auth uid', async () => {
    await GET(new Request('http://localhost/api/bookings?therapistId=someone_else'));

    expect(BookingService.getBookingsByTherapist).toHaveBeenCalledWith('therapist_priya');
    expect(BookingService.getBookingsByTherapist).not.toHaveBeenCalledWith('auth_uid_priya');
    // A caller cannot widen the response with a query parameter.
    expect(BookingService.getBookingsByTherapist).not.toHaveBeenCalledWith('someone_else');
  });

  it('does not claim an empty dashboard when the therapist profile is missing', async () => {
    mocks.getTherapist.mockResolvedValue({ empty: true, docs: [] });
    const response = await GET(new Request('http://localhost/api/bookings'));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('Therapist profile not found.');
    expect(BookingService.getBookingsByTherapist).not.toHaveBeenCalled();
  });

  it('does not let an unauthenticated caller reach a booking query', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const response = await GET(new Request('http://localhost/api/bookings'));

    expect(response.status).toBe(401);
    expect(BookingService.getBookingsByTherapist).not.toHaveBeenCalled();
    expect(BookingService.getBookings).not.toHaveBeenCalled();
  });

  it('marks personal booking lists as private and non-cacheable', async () => {
    const response = await GET(new Request('http://localhost/api/bookings'));
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
