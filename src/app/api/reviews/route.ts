import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifySession } from '@/lib/auth/verifySession';
import { ReviewService } from '@/services/reviewService';
import { logger } from '@/app/api/_lib/logger';
import type { Review } from '@/types';
import { z } from 'zod';

const postReviewSchema = z.object({
  bookingId: z.string().min(1, 'bookingId is required'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional()
});

/**
 * The public shape of a review. Stored reviews carry the client's uid, name
 * and email; on a therapy platform even "X is seeing therapist Y" is sensitive,
 * so none of that ever leaves through an unauthenticated read.
 */
function toPublicReview(review: Review) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user (honours the disabled-account / revoked-session kill-switch)
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse & Validate request body
    const body = await req.json();
    const parseResult = postReviewSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { bookingId, rating, comment } = parseResult.data;

    // 3. Submit review (verifySession only exposes a verified email)
    const result = await ReviewService.submitReview({
      bookingId,
      rating,
      comment,
      user: {
        uid: session.uid,
        email: session.email,
      }
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      review: result.review,
      alreadyReviewed: result.alreadyReviewed
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('REVIEWS_API', 'Failed to process POST review', { error: errorMsg });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    const therapistId = searchParams.get('therapistId');

    if (bookingId) {
      // A single booking's review is only visible to its author, the booking's
      // therapist, or an admin.
      const session = await verifySession(req);
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const review = await ReviewService.getReviewByBookingId(bookingId);
      if (!review) {
        return NextResponse.json({ review: null, exists: false }, { status: 200 });
      }

      let allowed = session.role === 'admin' || review.studentId === session.uid;
      if (!allowed && session.role === 'therapist' && review.therapistId) {
        const therapistSnap = await adminDb.collection('therapists').doc(review.therapistId).get();
        allowed = therapistSnap.exists && therapistSnap.data()?.authId === session.uid;
      }
      if (!allowed) {
        // Same answer as "no review" so booking ids cannot be probed.
        return NextResponse.json({ review: null, exists: false }, { status: 200 });
      }
      return NextResponse.json({ review, exists: true }, { status: 200 });
    }

    if (therapistId) {
      const summary = await ReviewService.getTherapistReviews(therapistId);
      return NextResponse.json({
        success: true,
        therapistId: summary.therapistId,
        averageRating: summary.averageRating,
        totalReviews: summary.totalReviews,
        reviews: summary.reviews.map(toPublicReview),
      }, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Provide either bookingId or therapistId query parameter' },
      { status: 400 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('REVIEWS_API', 'Failed to process GET review', { error: errorMsg });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
