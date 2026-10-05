import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { ReviewService } from '@/services/reviewService';
import { logger } from '@/app/api/_lib/logger';
import { z } from 'zod';

const postReviewSchema = z.object({
  bookingId: z.string().min(1, 'bookingId is required'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional()
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing authorization header' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
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

    // 3. Submit review
    const result = await ReviewService.submitReview({
      bookingId,
      rating,
      comment,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name
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
      const review = await ReviewService.getReviewByBookingId(bookingId);
      if (!review) {
        return NextResponse.json({ review: null, exists: false }, { status: 200 });
      }
      return NextResponse.json({ review, exists: true }, { status: 200 });
    }

    if (therapistId) {
      const summary = await ReviewService.getTherapistReviews(therapistId);
      return NextResponse.json({ success: true, ...summary }, { status: 200 });
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
