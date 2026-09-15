import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import type { Booking } from '@/domains/booking/entities/Booking';
import { OutboxService, OutboxProcessor, generateDeterministicEventId } from '@/shared/events/outbox';
import { logger } from '@/app/api/_lib/logger';
import { auditService } from '@/domains/audit/AuditService';

/**
 * Therapist post-session actions: private notes, client-facing summary, follow-up decision.
 *
 * Privacy boundaries (enforced server-side, never by UI hiding):
 * - `privateNotes`  : therapist-only. NEVER returned to the client, never emailed,
 *                     never exposed via manage-booking tokens or session/experience links.
 * - `clientSummary` : written by the therapist, visible to the client ONLY when
 *                     `clientSummaryShared === true` (explicit opt-in sharing).
 * - `followUpStatus`: scheduling decision only — not a clinical conclusion.
 *
 * All writes happen inside Firestore transactions on the booking document (backend-
 * exclusive: the browser cannot write these fields — they are set exclusively through
 * these server-authorized service methods), each recorded as a deterministic,
 * idempotent outbox event plus a booking audit_logs entry.
 */

export type FollowUpStatus = 'recommended' | 'scheduled' | 'deferred' | 'none';

export interface TherapistActor {
  uid: string;
  role: string;
}

export interface SaveSessionNotesInput {
  bookingId: string;
  privateNotes?: string;
  clientSummary?: string;
  shareSummaryWithClient?: boolean;
}

export interface SaveSessionNotesResult {
  success: boolean;
  alreadyExisted?: boolean;
  error?: string;
}

export interface SetFollowUpInput {
  bookingId: string;
  followUpStatus: FollowUpStatus;
}

export interface SetFollowUpResult {
  success: boolean;
  alreadyInTargetStatus?: boolean;
  error?: string;
}

export interface ClientSummaryView {
  clientSummary: string;
  clientSummarySharedAt: string | null;
}

const MAX_NOTES_LENGTH = 20_000;
const MAX_SUMMARY_LENGTH = 10_000;

/** Server-side authorization: the acting therapist must own the booking. */
async function assertTherapistOwnsBooking(booking: Booking, actor: TherapistActor): Promise<void> {
  if (actor.role === 'admin') return;

  if (actor.role !== 'therapist') {
    throw new Error('Unauthorized: Only the assigned therapist or an admin can perform this action');
  }

  const therapistDoc = await adminDb.collection('therapists').doc(booking.therapistId).get();
  if (!therapistDoc.exists) {
    throw new Error('Unauthorized: Therapist record not found');
  }
  const data = therapistDoc.data();
  const isOwner = data?.authId === actor.uid || data?.id === actor.uid;
  if (!isOwner) {
    throw new Error('Unauthorized: You can only manage your own sessions');
  }
}

function sanitizeText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return value.trim().slice(0, maxLength);
}

export class TherapistPostSessionService {
  /**
   * Creates or updates the post-session note document for a completed session.
   * Idempotent per booking (deterministic doc id `session_notes_${bookingId}`);
   * repeated saves update in place and never duplicate.
   */
  static async saveSessionNotes(input: SaveSessionNotesInput, actor: TherapistActor): Promise<SaveSessionNotesResult> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    const { bookingId } = input;
    const privateNotes = sanitizeText(input.privateNotes, MAX_NOTES_LENGTH);
    const clientSummary = sanitizeText(input.clientSummary, MAX_SUMMARY_LENGTH);

    if (privateNotes === undefined && clientSummary === undefined && input.shareSummaryWithClient === undefined) {
      return { success: false, error: 'Nothing to update' };
    }

    const outboxEventId = generateDeterministicEventId('booking', bookingId, 'session_notes_saved');

    try {
      let alreadyExisted = false;
      const touchedFields: string[] = [];

      await adminDb.runTransaction(async (t) => {
        const booking = await firestoreBookingRepository.findById(bookingId, t);
        if (!booking) {
          throw new Error('Booking not found');
        }

        await assertTherapistOwnsBooking(booking, actor);

        // Notes belong to a concluded session — mirrors the completion rules.
        if (booking.status !== 'completed' && booking.status !== 'no_show') {
          throw new Error(`Session notes can only be saved for completed sessions. Current status is '${booking.status}'`);
        }

        const notesRef = adminDb.collection('session_notes').doc(`session_notes_${bookingId}`);
        const existing = await t.get(notesRef);
        alreadyExisted = existing.exists;

        const now = FieldValue.serverTimestamp();

        if (privateNotes !== undefined) touchedFields.push('privateNotes');
        if (clientSummary !== undefined) touchedFields.push('clientSummary');
        if (input.shareSummaryWithClient !== undefined) touchedFields.push('clientSummaryShared');

        if (existing.exists) {
          const updates: Record<string, unknown> = { updatedAt: now };
          if (privateNotes !== undefined) updates.privateNotes = privateNotes;
          if (clientSummary !== undefined) updates.clientSummary = clientSummary;
          if (input.shareSummaryWithClient !== undefined) {
            updates.clientSummaryShared = input.shareSummaryWithClient;
            updates.clientSummarySharedAt = input.shareSummaryWithClient ? now : null;
          }
          t.update(notesRef, updates);
        } else {
          t.set(notesRef, {
            id: `session_notes_${bookingId}`,
            bookingId,
            userId: booking.userId,
            therapistId: booking.therapistId,
            privateNotes: privateNotes ?? '',
            clientSummary: clientSummary ?? '',
            clientSummaryShared: input.shareSummaryWithClient ?? false,
            clientSummarySharedAt: input.shareSummaryWithClient ? now : null,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Lightweight booking-level pointer for dashboards (no note content here).
        const bookingDocRef = adminDb.collection('bookings').doc(bookingId);
        t.update(bookingDocRef, {
          hasSessionNotes: true,
          ...(input.shareSummaryWithClient !== undefined ? { clientSummaryShared: input.shareSummaryWithClient } : {}),
          updatedAt: now,
        });

        OutboxService.recordEventInTransaction(t, {
          id: outboxEventId,
          name: 'SessionNotesSaved',
          aggregateType: 'booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            therapistId: booking.therapistId,
            updatedFields: {
              privateNotes: privateNotes !== undefined,
              clientSummary: clientSummary !== undefined,
              clientSummaryShared: input.shareSummaryWithClient !== undefined,
            },
            // NOTE: never include privateNotes/clientSummary content in events.
          },
        });

        const auditRef = adminDb.collection('bookings').doc(bookingId).collection('audit_logs').doc();
        t.set(auditRef, {
          action: 'session_notes_saved',
          timestamp: now,
          details: `Therapist saved post-session notes (fields: ${touchedFields.join(', ') || 'none'})`,
          userId: actor.uid,
        });
      });

      OutboxProcessor.processEvent(outboxEventId).catch((err) => {
        logger.error('NOTES', `Failed async processing of SessionNotesSaved event for ${bookingId}`, { error: String(err) });
      });

      return { success: true, alreadyExisted };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('NOTES', `Failed to save session notes for booking ${bookingId}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Therapist view of the full note document (private notes included).
   * Authorization: owning therapist or admin only.
   */
  static async getSessionNotes(bookingId: string, actor: TherapistActor): Promise<{ success: boolean; notes?: Record<string, unknown>; error?: string }> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    try {
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking) {
        return { success: false, error: 'Booking not found' };
      }

      await assertTherapistOwnsBooking(booking, actor);

      const snap = await adminDb.collection('session_notes').doc(`session_notes_${bookingId}`).get();
      if (!snap.exists) {
        return { success: true, notes: null as unknown as Record<string, unknown> };
      }

      return { success: true, notes: snap.data() as Record<string, unknown> };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('NOTES', `Failed to fetch session notes for booking ${bookingId}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Client view of the shared summary. Returns nothing unless the therapist
   * explicitly shared it. Private notes are NEVER included in this response.
   * Authorization: booking owner (by uid or verified email) only.
   */
  static async getClientSummary(bookingId: string, actor: { uid: string; email?: string }): Promise<{ success: boolean; summary?: ClientSummaryView; error?: string }> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    try {
      const booking = await firestoreBookingRepository.findById(bookingId);
      if (!booking) {
        return { success: false, error: 'Booking not found' };
      }

      const userEmail = (actor.email || '').toLowerCase();
      const bookingEmail = (booking.email || '').toLowerCase();
      const isOwner = booking.userId === actor.uid || (userEmail && bookingEmail && userEmail === bookingEmail);
      if (!isOwner) {
        throw new Error('Unauthorized: You can only view summaries for your own sessions');
      }

      if (booking.status !== 'completed') {
        return { success: false, error: 'Summary is available once the session is completed' };
      }

      const snap = await adminDb.collection('session_notes').doc(`session_notes_${bookingId}`).get();
      const data = snap.data();
      if (!snap.exists || !data?.clientSummaryShared || !data?.clientSummary) {
        return { success: false, error: 'No summary has been shared for this session' };
      }

      return {
        success: true,
        summary: {
          clientSummary: String(data.clientSummary),
          clientSummarySharedAt: data.clientSummarySharedAt
            ? this.toIso(data.clientSummarySharedAt)
            : null,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('NOTES', `Failed to fetch client summary for booking ${bookingId}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Records the therapist's follow-up scheduling decision on the booking.
   * This is a scheduling/continuity decision only — not a clinical conclusion.
   */
  static async setFollowUpStatus(input: SetFollowUpInput, actor: TherapistActor): Promise<SetFollowUpResult> {
    if (!adminDb) {
      throw new Error('Database is not initialized');
    }

    const valid: FollowUpStatus[] = ['recommended', 'scheduled', 'deferred', 'none'];
    if (!valid.includes(input.followUpStatus)) {
      return { success: false, error: `Invalid follow-up status. Must be one of: ${valid.join(', ')}` };
    }

    const outboxEventId = generateDeterministicEventId('booking', input.bookingId, `follow_up_${input.followUpStatus}`);

    try {
      let alreadyInTargetStatus = false;

      await adminDb.runTransaction(async (t) => {
        const booking = await firestoreBookingRepository.findById(input.bookingId, t);
        if (!booking) {
          throw new Error('Booking not found');
        }

        await assertTherapistOwnsBooking(booking, actor);

        if (booking.followUpStatus === input.followUpStatus) {
          alreadyInTargetStatus = true;
          return;
        }

        const now = FieldValue.serverTimestamp();
        const bookingDocRef = adminDb.collection('bookings').doc(input.bookingId);
        t.update(bookingDocRef, {
          followUpStatus: input.followUpStatus,
          followUpStatusUpdatedAt: now,
          followUpStatusUpdatedBy: actor.uid,
          updatedAt: now,
        });

        OutboxService.recordEventInTransaction(t, {
          id: outboxEventId,
          name: 'FollowUpStatusChanged',
          aggregateType: 'booking',
          aggregateId: input.bookingId,
          payload: {
            bookingId: input.bookingId,
            therapistId: booking.therapistId,
            previousStatus: booking.followUpStatus ?? null,
            newStatus: input.followUpStatus,
          },
        });

        const auditRef = adminDb.collection('bookings').doc(input.bookingId).collection('audit_logs').doc();
        t.set(auditRef, {
          action: 'follow_up_status_changed',
          timestamp: now,
          details: `Follow-up status set to '${input.followUpStatus}'${booking.followUpStatus ? ` (was '${booking.followUpStatus}')` : ''}`,
          userId: actor.uid,
        });
      });

      if (!alreadyInTargetStatus) {
        OutboxProcessor.processEvent(outboxEventId).catch((err) => {
          logger.error('FOLLOWUP', `Failed async processing of FollowUpStatusChanged event for ${input.bookingId}`, { error: String(err) });
        });
      }

      await auditService.logEvent(
        'FOLLOW_UP_STATUS_SET',
        { followUpStatus: input.followUpStatus, bookingId: input.bookingId },
        actor.uid,
        input.bookingId
      );

      return { success: true, alreadyInTargetStatus };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('FOLLOWUP', `Failed to set follow-up status for booking ${input.bookingId}`, { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  }

  private static toIso(val: unknown): string {
    const v = val as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof v?.toMillis === 'function') return new Date(v.toMillis()).toISOString();
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    return new Date(String(val)).toISOString();
  }
}


