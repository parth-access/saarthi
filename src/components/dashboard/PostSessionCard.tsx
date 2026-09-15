'use client';

import React, { useState } from 'react';
import { Star, FileText, Sparkles, ChevronRight, CheckCircle } from 'lucide-react';
import { auth } from '@/lib/firebase/client';
import { Booking, Therapist } from '@/types';
import { ReviewModal } from './ReviewModal';

/**
 * Post-session card for the user dashboard.
 *
 * Shows, for the most recently completed session:
 * - completion state
 * - feedback prompt (or the submitted rating)
 * - the therapist-shared session summary, if the therapist chose to share one
 * - follow-up state ("book another whenever you need" — never pressure)
 *
 * Privacy: this card only ever reads the SHARED summary via
 * /api/bookings/[bookingId]/summary. Private therapist notes are never
 * requested and never rendered here.
 */

interface PostSessionCardProps {
  session: Booking;
  therapist?: Therapist;
  onFeedbackSubmitted?: () => void;
}

interface ClientSummary {
  clientSummary: string;
  clientSummarySharedAt: string | null;
}

export const PostSessionCard: React.FC<PostSessionCardProps> = ({ session, therapist, onFeedbackSubmitted }) => {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [summary, setSummary] = useState<ClientSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const hasFeedback = !!session.reviewRating;
  const hasFollowUp = session.followUpStatus === 'recommended' || session.followUpStatus === 'scheduled';
  const noFollowUp = session.followUpStatus === 'none';

  const loadSummary = async () => {
    if (summary || summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const user = auth?.currentUser;
      if (!user) throw new Error('Please sign in to view your summary');
      const token = await user.getIdToken();
      const res = await fetch(`/api/bookings/${session.id}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No summary available');
      }
      setSummary(data.summary);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not load summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const therapistName = therapist?.name || 'your therapist';

  return (
    <section
      aria-label="Your completed session"
      className="relative overflow-hidden rounded-[2rem] border border-primary/10 bg-white shadow-sm"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 rounded-bl-full pointer-events-none" />
      <div className="relative p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-5">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-accent font-bold font-sans">
            <CheckCircle className="w-3.5 h-3.5" /> Session complete
          </span>
        </div>

        <h3 className="text-xl font-serif text-primary mb-1">
          Your session with {therapistName}
        </h3>
        <p className="text-sm text-primary/60 font-sans mb-6">
          Thank you for showing up for yourself.
        </p>

        {/* Feedback */}
        <div className="rounded-2xl bg-background/50 border border-primary/5 p-5 mb-4">
          <h4 className="text-sm font-semibold text-primary mb-1 font-sans">How was your session?</h4>
          {hasFeedback ? (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-0.5" aria-label={`Rated ${session.reviewRating} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`w-4 h-4 ${n <= (session.reviewRating || 0) ? 'fill-accent text-accent' : 'text-primary/20'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-primary/50 font-sans">Thank you for your feedback</span>
            </div>
          ) : (
            <>
              <p className="text-xs text-primary/50 font-sans mb-3">
                Your honest reflection helps us support you better. Optional, always.
              </p>
              <button
                onClick={() => setReviewOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-full hover:bg-primary/90 transition-colors cursor-pointer font-sans"
              >
                <Star className="w-3.5 h-3.5" /> Rate this session
              </button>
            </>
          )}
        </div>

        {/* Shared summary (opt-in by therapist) */}
        {!summary && (
          <button
            onClick={loadSummary}
            disabled={summaryLoading}
            className="w-full text-left rounded-2xl bg-background/50 border border-primary/5 p-5 mb-4 hover:border-primary/15 transition-colors group cursor-pointer disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-accent shrink-0" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-primary font-sans">Session summary</h4>
                <p className="text-xs text-primary/50 font-sans">
                  {summaryLoading
                    ? 'Checking for a shared summary…'
                    : summaryError
                      ? 'No summary was shared for this session.'
                      : 'If your therapist shared one, you can read it here.'}
                </p>
              </div>
              {!summaryLoading && !summaryError && <ChevronRight className="w-4 h-4 text-primary/30 group-hover:text-accent transition-colors" />}
            </div>
          </button>
        )}
        {summary && (
          <div className="rounded-2xl bg-background/50 border border-primary/5 p-5 mb-4">
            <h4 className="text-sm font-semibold text-primary mb-3 font-sans flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" /> Session summary
            </h4>
            <p className="text-sm text-primary/70 font-sans whitespace-pre-line leading-relaxed">{summary.clientSummary}</p>
          </div>
        )}

        {/* Follow-up state */}
        <div className="rounded-2xl bg-background/50 border border-primary/5 p-5">
          <h4 className="text-sm font-semibold text-primary mb-1 font-sans">Your next step</h4>
          {hasFollowUp ? (
            <p className="text-xs text-primary/50 font-sans mb-3">
              {session.followUpStatus === 'scheduled'
                ? 'A follow-up session has been scheduled — it will appear in your upcoming sessions.'
                : 'Your therapist recommended a follow-up. Book whenever it feels right for you.'}
            </p>
          ) : noFollowUp ? (
            <p className="text-xs text-primary/50 font-sans mb-3">
              No follow-up is currently planned. You can book another session whenever you need one.
            </p>
          ) : (
            <p className="text-xs text-primary/50 font-sans mb-3">
              You can book another session whenever you need one.
            </p>
          )}
          <a
            href="/book"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-full hover:bg-primary/90 transition-colors font-sans"
          >
            <Sparkles className="w-3.5 h-3.5" /> Book another session
          </a>
        </div>
      </div>

      <ReviewModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        booking={session}
        onReviewSubmitted={() => {
          onFeedbackSubmitted?.();
        }}
      />
    </section>
  );
};
