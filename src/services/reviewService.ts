import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { OutboxService, OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { logger } from '@/app/api/_lib/logger';
import { Review } from '@/types';

export interface SubmitReviewInput {
  bookingId: string;
  rating: number;
  comment?: string;
  user: {
    uid: string;
    email?: string;
    name?: string;
  };
}

export interface SubmitReviewResult {
  success: boolean;
  review?: Review;
  alreadyReviewed?: boolean;
  error?: string;
}

export interface TherapistReviewSummary {
  therapistId: string;
  averageRating: number;
  totalReviews: number;
  reviews: Review[];
}

export class ReviewService {
  /**
   * Submits a review for a completed therapy session.
   * Guarantees one review per booking via deterministic ID: review_${bookingId}.
   */
  static async submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    const { bookingId, rating, comment, user } = input;

    // 1. Validate rating bounds
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return {
        success: false,
        error: 'Rating must be an integer between 1 and 5'
      };
    }

    // 2. Sanitize and validate comment
    const sanitizedComment = (comment || '').trim().slice(0, 1000);

    const reviewId = `review_${bookingId}`;
    const outboxEventId = generateDeterministicEventId('booking', bookingId, 'review_submitted');
    let reviewRecord: Review | null = null;
    let isAlreadyReviewed = false;

    try {
      await adminDb.runTransaction(async (t) => {
        // 3. Verify booking exists
        const booking = await firestoreBookingRepository.findById(bookingId, t);
        if (!booking) {
          throw new Error('Booking not found');
        }

        // 4. Verify user ownership
        const userEmail = (user.email || '').toLowerCase();
        const bookingEmail = (booking.email || '').toLowerCase();
        const isOwner = booking.userId === user.uid || (userEmail && bookingEmail && userEmail === bookingEmail);

        if (!isOwner) {
          throw new Error('Unauthorized: You can only review your own sessions');
        }

        // 5. Verify status eligibility (strictly completed sessions)
        if (booking.status !== 'completed') {
          if (booking.status === 'no_show') {
            throw new Error('Reviews cannot be submitted for sessions marked as no-show');
          }
          if (booking.status === 'cancelled' || booking.status === 'rejected') {
            throw new Error('Reviews cannot be submitted for cancelled or declined sessions');
          }
          throw new Error(`Reviews can only be submitted for completed sessions. Current status is '${booking.status}'`);
        }

        const reviewRef = adminDb.collection('reviews').doc(reviewId);
        const existingDoc = await t.get(reviewRef);

        const now = FieldValue.serverTimestamp();

        if (existingDoc.exists) {
          isAlreadyReviewed = true;
          // Update existing review
          t.update(reviewRef, {
            rating,
            comment: sanitizedComment,
            updatedAt: now
          });

          reviewRecord = {
            id: reviewId,
            bookingId,
            studentId: user.uid,
            studentName: user.name || booking.name || 'Anonymous Student',
            studentEmail: user.email || booking.email,
            therapistId: booking.therapistId,
            rating,
            comment: sanitizedComment,
            createdAt: existingDoc.data()?.createdAt,
            updatedAt: new Date().toISOString()
          };
        } else {
          // Create new review
          reviewRecord = {
            id: reviewId,
            bookingId,
            studentId: user.uid,
            studentName: user.name || booking.name || 'Anonymous Student',
            studentEmail: user.email || booking.email,
            therapistId: booking.therapistId,
            rating,
            comment: sanitizedComment,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          t.set(reviewRef, {
            id: reviewId,
            bookingId,
            studentId: user.uid,
            studentName: user.name || booking.name || 'Anonymous Student',
            studentEmail: user.email || booking.email,
            therapistId: booking.therapistId,
            rating,
            comment: sanitizedComment,
            createdAt: now,
            updatedAt: now
          });
        }

        // Update booking with review reference
        const bookingDocRef = adminDb.collection('bookings').doc(bookingId);
        t.update(bookingDocRef, {
          reviewRating: rating,
          reviewComment: sanitizedComment,
          reviewedAt: now,
          reviewId
        });

        // Record outbox event
        OutboxService.recordEventInTransaction(t, {
          id: outboxEventId,
          name: 'ReviewSubmitted',
          aggregateType: 'booking',
          aggregateId: bookingId,
          payload: {
            reviewId,
            bookingId,
            rating,
            comment: sanitizedComment,
            studentId: user.uid,
            therapistId: booking.therapistId,
            timestamp: new Date().toISOString()
          }
        });

        // Record sub-collection audit log
        const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
        t.set(auditRef, {
          action: 'review_submitted',
          rating,
          reviewId,
          timestamp: now,
          details: `Client submitted a ${rating}/5 star review`,
          userId: user.uid
        });
      });

      // Process outbox asynchronously
      OutboxProcessor.processEvent(outboxEventId).catch((err) => {
        logger.error('REVIEW', `Failed async processing of ReviewSubmitted event for ${reviewId}`, { error: String(err) });
      });

      return {
        success: true,
        review: reviewRecord || undefined,
        alreadyReviewed: isAlreadyReviewed
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('REVIEW', `Failed to submit review for booking ${bookingId}`, { error: errorMsg });
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  /**
   * Retrieves a review by booking ID.
   */
  static async getReviewByBookingId(bookingId: string): Promise<Review | null> {
    if (!adminDb) return null;
    try {
      const reviewId = `review_${bookingId}`;
      const docSnap = await adminDb.collection('reviews').doc(reviewId).get();
      if (!docSnap.exists) {
        return null;
      }
      return { id: docSnap.id, ...docSnap.data() } as Review;
    } catch (err) {
      logger.error('REVIEW', `Failed to fetch review for booking ${bookingId}`, { error: String(err) });
      return null;
    }
  }

  /**
   * Retrieves all reviews and calculates aggregate summary for a therapist.
   */
  static async getTherapistReviews(therapistId: string): Promise<TherapistReviewSummary> {
    if (!adminDb) {
      return { therapistId, averageRating: 0, totalReviews: 0, reviews: [] };
    }

    try {
      const snap = await adminDb
        .collection('reviews')
        .where('therapistId', '==', therapistId)
        .get();

      const reviews: Review[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Review));
      
      const totalReviews = reviews.length;
      const sumRatings = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
      const averageRating = totalReviews > 0 ? parseFloat((sumRatings / totalReviews).toFixed(1)) : 0;

      return {
        therapistId,
        averageRating,
        totalReviews,
        reviews
      };
    } catch (err) {
      logger.error('REVIEW', `Failed to fetch reviews for therapist ${therapistId}`, { error: String(err) });
      return { therapistId, averageRating: 0, totalReviews: 0, reviews: [] };
    }
  }
}
