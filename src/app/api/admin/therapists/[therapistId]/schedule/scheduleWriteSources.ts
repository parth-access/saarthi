/**
 * The Firestore side of admin schedule management: reading the schedule a write
 * will be judged against, scanning the bookings it could strand, and applying the
 * change with an audit entry in the same transaction.
 *
 * Three things here differ deliberately from the read path in
 * `../../therapistSources.ts`, and each one matters:
 *
 *  1. **A failed read is an exception, not data.** The read path degrades — a
 *     subcollection that will not load reports itself and the page still renders.
 *     A write cannot do that. Validating a new rule against a schedule that is
 *     missing half its rows would let an overlap through, so a failed read here
 *     aborts the request.
 *
 *  2. **A malformed document is kept, not dropped.** The read path discards a rule
 *     whose `dayOfWeek` is not a weekday. Discarding it here would be a lie about
 *     the therapist's state: the booking validator counts raw documents when it
 *     decides whether a therapist has *any* configuration, so a therapist holding
 *     one broken rule is not in the "available at any time" fail-open even though
 *     the rule offers nothing. Broken rows are therefore carried through as inert
 *     placeholders — a weekday of -1 and switched off, which no reader can match —
 *     so the counts stay honest and an operator can still delete them by id.
 *
 *  3. **Structure is re-checked inside the transaction.** Validating against a
 *     snapshot read seconds earlier enforces nothing if a second admin is editing
 *     the same therapist. The overlap, the one-override-per-date rule and the
 *     existence of an edit's target are all re-evaluated against reads made inside
 *     the transaction, so the guarantee is enforced rather than merely checked.
 *
 * The booking impact is the one thing not recomputed inside the transaction: it
 * needs up to `STRANDED_SCAN_LIMIT` documents from `bookings`, and pulling those
 * into a transaction on the busiest collection in the project would trade a rare
 * race for routine contention. It is recomputed on the confirming request, and the
 * exact set shown to the operator is written into the audit entry — so a booking
 * created in the gap is discoverable afterwards rather than invisible. No booking
 * is ever written by this module, so the worst case is a session that needs moving
 * by hand and was not on the list.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  checkOverrideDraft,
  checkRuleDraft,
  STRANDED_SCAN_LIMIT,
  type ScheduleImpact,
  type ScheduleOverrideDraft,
  type ScheduleRuleDraft,
  type StrandCandidate,
} from '@/domains/admin/therapistScheduleWrite';
import type { AdminScheduleOverride, AdminScheduleRule } from '@/domains/admin/therapistSchedule';
import type { AvailabilityBreak } from '@/shared/scheduling/slots';

/** A refusal an operator caused and can act on, as opposed to a server fault. */
export class ScheduleWriteRefusal extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ScheduleWriteRefusal';
  }
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toBreaks(value: unknown): AvailabilityBreak[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return { startTime: stringOr(record.startTime, ''), endTime: stringOr(record.endTime, '') };
    })
    .filter((b) => b.startTime.length > 0 && b.endTime.length > 0);
}

/**
 * A stored rule. A `dayOfWeek` that is not a weekday becomes -1 and switched off:
 * inert to every reader, still present in the count, still deletable by id.
 */
function toWriteRule(id: string, data: Record<string, unknown>): AdminScheduleRule {
  const raw = data.dayOfWeek;
  const placeable = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6;
  return {
    id,
    dayOfWeek: placeable ? raw : -1,
    // Absent `isActive` is active, matching the lister and the validator.
    isActive: placeable ? data.isActive !== false : false,
    startTime: stringOr(data.startTime, ''),
    endTime: stringOr(data.endTime, ''),
    slotDuration: finiteOr(data.slotDuration, 0),
    cooldownGap: finiteOr(data.cooldownGap, 0),
    breaks: toBreaks(data.breaks),
  };
}

/** A stored override. A missing date becomes '' — a value no calendar date equals. */
function toWriteOverride(id: string, data: Record<string, unknown>): AdminScheduleOverride {
  return {
    id,
    date: trimmedOrNull(data.date) ?? '',
    type: data.type === 'available' ? 'available' : 'blocked',
    startTime: trimmedOrNull(data.startTime),
    endTime: trimmedOrNull(data.endTime),
    slotDuration: typeof data.slotDuration === 'number' && Number.isFinite(data.slotDuration) ? data.slotDuration : null,
    cooldownGap: typeof data.cooldownGap === 'number' && Number.isFinite(data.cooldownGap) ? data.cooldownGap : null,
    breaks: toBreaks(data.breaks),
    reason: trimmedOrNull(data.reason),
  };
}

function rulesPath(therapistId: string): string {
  return `therapistAvailability/${therapistId}/recurringRules`;
}

function overridesPath(therapistId: string): string {
  return `therapistAvailability/${therapistId}/overrides`;
}

export interface StoredSchedule {
  readonly therapistName: string;
  readonly rules: readonly AdminScheduleRule[];
  readonly overrides: readonly AdminScheduleOverride[];
}

/**
 * The therapist and their current schedule, or `null` when no therapist document
 * exists under that id.
 *
 * The existence check is not decoration: writing to
 * `therapistAvailability/{id}/recurringRules` creates the parent path implicitly,
 * so a typo'd id would silently produce a schedule belonging to nobody, invisible
 * on the roster and impossible to find again.
 */
export async function readScheduleForWrite(therapistId: string): Promise<StoredSchedule | null> {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');

  const therapist = await adminDb.collection('therapists').doc(therapistId).get();
  if (!therapist.exists) return null;

  const [rulesSnap, overridesSnap] = await Promise.all([
    adminDb.collection(rulesPath(therapistId)).get(),
    adminDb.collection(overridesPath(therapistId)).get(),
  ]);

  return {
    therapistName: trimmedOrNull((therapist.data() ?? {}).name) ?? 'Unnamed therapist',
    rules: rulesSnap.docs.map((doc) => toWriteRule(doc.id, (doc.data() ?? {}) as Record<string, unknown>)),
    overrides: overridesSnap.docs.map((doc) => toWriteOverride(doc.id, (doc.data() ?? {}) as Record<string, unknown>)),
  };
}

export interface BookingScan {
  readonly candidates: readonly StrandCandidate[];
  /** True when the scan hit its cap, so the result is a floor and not a total. */
  readonly atLeast: boolean;
}

/**
 * The bookings a schedule change could affect.
 *
 * Equality-only on `therapistId` with a `limit`, then filtered by date and status
 * in memory. That shape is served by the automatic single-field index, so this adds
 * nothing to `firestore.indexes.json` and cannot fail on a missing composite index
 * in production — the same trade the client profile, the recent-orders scan and the
 * calendar-retry scan already make. The cost is that the cap can cut off documents
 * a date filter would have excluded anyway, which is why hitting it is reported
 * rather than hidden.
 */
export async function scanBookingsForImpact(
  therapistId: string,
  limit: number = STRANDED_SCAN_LIMIT
): Promise<BookingScan> {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');

  const snapshot = await adminDb
    .collection('bookings')
    .where('therapistId', '==', therapistId)
    .limit(limit + 1)
    .get();

  const atLeast = snapshot.docs.length > limit;
  const candidates = snapshot.docs.slice(0, limit).map((doc): StrandCandidate => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    return {
      id: doc.id,
      // No default for a missing date: the impact check treats an unusable date as
      // not-offered on both sides, so it is never reported as this edit's doing.
      date: stringOr(data.date, ''),
      time: stringOr(data.time, ''),
      status: stringOr(data.status, ''),
      clientName: trimmedOrNull(data.name),
    };
  });

  return { candidates, atLeast };
}

/** The change to apply, carrying the draft so it can be re-checked transactionally. */
export type ScheduleChange =
  | { readonly action: 'save_rule'; readonly ruleId: string | null; readonly draft: ScheduleRuleDraft }
  | { readonly action: 'delete_rule'; readonly ruleId: string }
  | { readonly action: 'save_override'; readonly overrideId: string | null; readonly draft: ScheduleOverrideDraft }
  | { readonly action: 'delete_override'; readonly overrideId: string };

/**
 * How many stranded bookings get a note on their own timeline. Bounded so one
 * schedule edit cannot turn into an unbounded transaction; the count actually
 * written is recorded in the audit entry alongside the full stranded list.
 */
export const STRAND_NOTE_LIMIT = 25;

export interface AppliedWrite {
  /** The document written or removed, so the response and the log agree on which. */
  readonly targetId: string;
  readonly strandNotesWritten: number;
}

/** The rule fields as they are stored. Whitelisted — nothing from the request survives. */
function ruleDocument(therapistId: string, draft: ScheduleRuleDraft): Record<string, unknown> {
  return {
    therapistId,
    dayOfWeek: draft.dayOfWeek,
    isActive: draft.isActive,
    startTime: draft.startTime,
    endTime: draft.endTime,
    slotDuration: draft.slotDuration,
    cooldownGap: draft.cooldownGap,
    breaks: draft.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
  };
}

function overrideDocument(therapistId: string, draft: ScheduleOverrideDraft): Record<string, unknown> {
  return {
    therapistId,
    date: draft.date,
    type: draft.type,
    // Null rather than absent: this project never enables
    // `ignoreUndefinedProperties`, and an explicit null is what the read path
    // already narrows to.
    startTime: draft.startTime,
    endTime: draft.endTime,
    slotDuration: draft.slotDuration,
    cooldownGap: draft.cooldownGap,
    breaks: draft.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
    reason: draft.reason,
  };
}

/**
 * Applies the change and records it, in one transaction.
 *
 * The structural checks run again here against reads made inside the transaction,
 * which is what turns "no overlapping availability" from a validation into a
 * guarantee. A refusal at this point means another admin changed the same
 * therapist while this request was in flight, so it comes back as a 409 telling the
 * operator to reload rather than as a server error.
 */
export async function applyScheduleWrite(input: {
  readonly therapistId: string;
  readonly therapistName: string;
  readonly change: ScheduleChange;
  readonly actorUid: string;
  readonly impact: ScheduleImpact;
}): Promise<AppliedWrite> {
  if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
  const db = adminDb;
  const { therapistId, change, actorUid, impact } = input;

  const rulesRef = db.collection(rulesPath(therapistId));
  const overridesRef = db.collection(overridesPath(therapistId));

  return db.runTransaction(async (tx) => {
    // Every read first: Firestore requires reads to precede writes in a transaction.
    const [rulesSnap, overridesSnap] = await Promise.all([tx.get(rulesRef), tx.get(overridesRef)]);
    const freshRules = rulesSnap.docs.map((doc) =>
      toWriteRule(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );
    const freshOverrides = overridesSnap.docs.map((doc) =>
      toWriteOverride(doc.id, (doc.data() ?? {}) as Record<string, unknown>)
    );
    const createdAtOf = (snap: typeof rulesSnap, id: string): unknown =>
      snap.docs.find((doc) => doc.id === id)?.data()?.createdAt;

    let targetId: string;
    let before: Record<string, unknown> | null = null;
    let after: Record<string, unknown> | null = null;

    if (change.action === 'save_rule') {
      const { ruleId, draft } = change;
      if (ruleId && !freshRules.some((rule) => rule.id === ruleId)) {
        throw new ScheduleWriteRefusal(
          409,
          'Those working hours no longer exist — they were removed while this page was open. Reload and try again.'
        );
      }
      const recheck = checkRuleDraft(draft, freshRules, ruleId);
      if (!recheck.ok) throw new ScheduleWriteRefusal(409, `${recheck.problem} (The schedule changed while this page was open — reload.)`);

      const ref = ruleId ? rulesRef.doc(ruleId) : rulesRef.doc();
      targetId = ref.id;
      before = ruleId ? (rulesSnap.docs.find((doc) => doc.id === ruleId)?.data() ?? null) : null;
      after = ruleDocument(therapistId, draft);
      tx.set(ref, {
        ...after,
        createdAt: createdAtOf(rulesSnap, ref.id) ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (change.action === 'delete_rule') {
      const existing = rulesSnap.docs.find((doc) => doc.id === change.ruleId);
      if (!existing) {
        throw new ScheduleWriteRefusal(404, 'Those working hours have already been removed. Reload to see the current schedule.');
      }
      targetId = change.ruleId;
      before = existing.data() ?? null;
      tx.delete(rulesRef.doc(change.ruleId));
    } else if (change.action === 'save_override') {
      const { overrideId, draft } = change;
      if (overrideId && !freshOverrides.some((row) => row.id === overrideId)) {
        throw new ScheduleWriteRefusal(
          409,
          'That date exception no longer exists — it was removed while this page was open. Reload and try again.'
        );
      }
      const recheck = checkOverrideDraft(draft, freshOverrides, overrideId);
      if (!recheck.ok) throw new ScheduleWriteRefusal(409, `${recheck.problem} (The schedule changed while this page was open — reload.)`);

      const ref = overrideId ? overridesRef.doc(overrideId) : overridesRef.doc();
      targetId = ref.id;
      before = overrideId ? (overridesSnap.docs.find((doc) => doc.id === overrideId)?.data() ?? null) : null;
      after = overrideDocument(therapistId, draft);
      tx.set(ref, {
        ...after,
        createdAt: createdAtOf(overridesSnap, ref.id) ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      const existing = overridesSnap.docs.find((doc) => doc.id === change.overrideId);
      if (!existing) {
        throw new ScheduleWriteRefusal(404, 'That date exception has already been removed. Reload to see the current schedule.');
      }
      targetId = change.overrideId;
      before = existing.data() ?? null;
      tx.delete(overridesRef.doc(change.overrideId));
    }

    const strandedIds = impact.stranded.map((booking) => booking.id);
    const noted = strandedIds.slice(0, STRAND_NOTE_LIMIT);

    // A note on each affected booking's own trail. This is the difference between
    // "auditable" and "findable": the top-level entry answers "what did the admin
    // change", and this answers the question an operator actually asks three days
    // later, which is "why is this session outside the therapist's hours".
    for (const bookingId of noted) {
      const noteRef = db.collection('bookings').doc(bookingId).collection('audit_logs').doc();
      tx.set(noteRef, {
        eventType: 'THERAPIST_SCHEDULE_CHANGED_AROUND_BOOKING',
        bookingId,
        therapistId,
        performedBy: actorUid,
        timestamp: FieldValue.serverTimestamp(),
        details: `${input.therapistName}'s working hours changed and this session's time is no longer offered. The booking was left exactly as it is — it still needs running or rescheduling by hand.`,
      });
    }

    const auditRef = db.collection('audit_logs').doc();
    tx.set(auditRef, {
      eventType: 'THERAPIST_SCHEDULE_UPDATED',
      therapistId,
      therapistName: input.therapistName,
      action: change.action,
      targetId,
      targetCollection: change.action.endsWith('_rule') ? 'recurringRules' : 'overrides',
      // `userId` is the field the timeline reader resolves an actor from.
      userId: actorUid,
      before,
      after,
      strandedBookingIds: strandedIds,
      strandedCount: strandedIds.length,
      strandNotesWritten: noted.length,
      bookingScanTruncated: impact.atLeast,
      leavesNoConfiguration: impact.losesAllConfiguration,
      timestamp: FieldValue.serverTimestamp(),
      details:
        `Admin ${actorUid} performed ${change.action} on ${input.therapistName} (${therapistId}), document ${targetId}. ` +
        `${strandedIds.length} existing booking(s) fall outside the new hours and were left unchanged` +
        `${impact.atLeast ? ' (booking scan was truncated, so there may be more)' : ''}.`,
    });

    return { targetId, strandNotesWritten: noted.length };

  });
}




