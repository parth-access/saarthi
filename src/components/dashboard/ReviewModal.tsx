'use client';

import React, { useState } from 'react';
import { Star, X, CheckCircle, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase/client';
import { Booking, Review } from '@/types';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking;
  existingReview?: Review | null;
  onReviewSubmitted?: (review: Review) => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Disappointing',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Exceptional'
};

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  booking,
  existingReview,
  onReviewSubmitted
}) => {
  const [rating, setRating] = useState<number>(existingReview?.rating || booking.reviewRating || 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>(existingReview?.comment || booking.reviewComment || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating between 1 and 5');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const user = auth?.currentUser;
      if (!user) {
        throw new Error('Please sign in to submit a review');
      }

      const token = await user.getIdToken();
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingId: booking.id,
          rating,
          comment: comment.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit review');
      }

      setSuccess(true);
      if (onReviewSubmitted && data.review) {
        onReviewSubmitted(data.review);
      }

      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while submitting review');
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating || rating;

  return (
    <div
      id={`review-modal-${booking.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {existingReview || booking.reviewRating ? 'Update Session Review' : 'Rate Your Therapy Session'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              With {booking.therapistName || 'Therapist'} • {booking.date} at {booking.time}
            </p>
          </div>
          <button
            id={`close-review-modal-${booking.id}`}
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition"
            aria-label="Close review dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7" />
            </div>
            <h4 className="text-lg font-medium text-slate-900">Thank you for your feedback!</h4>
            <p className="text-sm text-slate-500">Your review helps us maintain compassionate, top-quality therapy support.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="p-3 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg">
                {error}
              </div>
            )}

            {/* Star Selection */}
            <div className="text-center py-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Select Your Rating
              </label>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    id={`star-btn-${star}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-9 h-9 transition-colors duration-150 ${
                        star <= activeRating
                          ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                          : 'text-slate-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-sm font-medium text-amber-600 min-h-[20px]">
                {RATING_LABELS[activeRating] || ''}
              </p>
            </div>

            {/* Feedback / Comments */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor={`review-comment-${booking.id}`}
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  Your Thoughts (Optional)
                </label>
                <span className="text-xs text-slate-400">
                  {comment.length}/1000
                </span>
              </div>
              <textarea
                id={`review-comment-${booking.id}`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="How did the session feel? Any feedback regarding your therapist's support, atmosphere, or takeaways?"
                className="w-full px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                id={`cancel-review-btn-${booking.id}`}
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                id={`submit-review-btn-${booking.id}`}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 rounded-xl shadow-sm hover:shadow transition"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>{existingReview || booking.reviewRating ? 'Update Review' : 'Submit Review'}</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
