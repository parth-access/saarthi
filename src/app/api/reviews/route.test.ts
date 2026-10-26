import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockVerifySession, mockGetTherapistReviews, mockGetReviewByBookingId } = vi.hoisted(() => ({
  mockVerifySession: vi.fn(),
  mockGetTherapistReviews: vi.fn(),
  mockGetReviewByBookingId: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: vi.fn() } }));
vi.mock('@/lib/auth/verifySession', () => ({ verifySession: mockVerifySession }));
vi.mock('@/services/reviewService', () => ({
  ReviewService: {
    getTherapistReviews: mockGetTherapistReviews,
    getReviewByBookingId: mockGetReviewByBookingId,
    submitReview: vi.fn(),
  },
}));

import { GET } from './route';

const storedReview = {
  id: 'review_bk_1',
  bookingId: 'bk_1',
  studentId: 'uid_client',
  studentName: 'Asha Client',
  studentEmail: 'asha@example.com',
  therapistId: 'th_1',
  rating: 5,
  comment: 'Helpful',
  createdAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTherapistReviews.mockResolvedValue({
    therapistId: 'th_1',
    averageRating: 5,
    totalReviews: 1,
    reviews: [storedReview],
  });
  mockGetReviewByBookingId.mockResolvedValue(storedReview);
});

describe('GET /api/reviews', () => {
  it('never returns client identity on the public therapist listing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/reviews?therapistId=th_1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reviews).toEqual([
      { id: 'review_bk_1', rating: 5, comment: 'Helpful', createdAt: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/asha|uid_client|bookingId|studentId/i);
  });

  it('requires a session for a single booking review', async () => {
    mockVerifySession.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/reviews?bookingId=bk_1'));
    expect(res.status).toBe(401);
    expect(mockGetReviewByBookingId).not.toHaveBeenCalled();
  });

  it('hides a booking review from a signed-in stranger', async () => {
    mockVerifySession.mockResolvedValue({ uid: 'uid_other', role: 'client' });
    const res = await GET(new NextRequest('http://localhost/api/reviews?bookingId=bk_1'));
    expect(await res.json()).toEqual({ review: null, exists: false });
  });

  it('shows a booking review to its author', async () => {
    mockVerifySession.mockResolvedValue({ uid: 'uid_client', role: 'client' });
    const res = await GET(new NextRequest('http://localhost/api/reviews?bookingId=bk_1'));
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.review.studentEmail).toBe('asha@example.com');
  });
});
