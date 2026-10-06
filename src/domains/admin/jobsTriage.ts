/**
 * Background-job triage: the shapes the Background jobs screen reads, and the
 * pure decisions about what an operator may do with each row.
 *
 * Client-safe on purpose. The API's readers project Firestore documents into
 * these rows; the interpreter carries them to the browser; the screen renders
 * them. What this module adds is the judgment:
 *
 *  - A `dead` outbox event is the one status nobody will pick up again —
 *    `OutboxProcessor` excludes it from its scan — so it leads the screen.
 *  - Replay is only offered where republishing is safe, which is the two
 *    lifecycle events `POST /api/operations/replay` allow-lists. Everything else
 *    says so honestly instead of offering a button that would be refused.
 *  - Attempt counts are shown as "used of allowed", because "attempts: 4" means
 *    nothing without the ceiling it is up against.
 */

/** Event names `POST /api/operations/replay` accepts. Keep in step with the route's allow-list. */
export const REPLAYABLE_EVENT_NAMES = ['BookingConfirmed', 'BookingExpired'] as const;
export type ReplayableEventName = (typeof REPLAYABLE_EVENT_NAMES)[number];

export type JobScan<Row> =
  | { readonly ok: true; readonly rows: readonly Row[]; readonly atLeast: boolean }
  | { readonly ok: false; readonly reason: string };

export interface JobEventRow {
  readonly id: string;
  readonly name: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAtIso: string | null;
  readonly lastAttemptAtIso: string | null;
  readonly nextAttemptAtIso: string | null;
  /** The most recent error, if any attempt recorded one. */
  readonly error: string | null;
}

export interface JobEmailRow {
  readonly id: string;
  readonly bookingId: string | null;
  readonly type: string;
  readonly recipient: string;
  readonly subject: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly createdAtIso: string | null;
  readonly updatedAtIso: string | null;
}

/** Whether the screen may offer a replay for this outbox row. */
export function isReplayableEvent(row: JobEventRow): boolean {
  return (
    row.aggregateType === 'booking' &&
    (REPLAYABLE_EVENT_NAMES as readonly string[]).includes(row.name)
  );
}

export function attemptsDisplay(row: Pick<JobEventRow, 'attempts' | 'maxAttempts'>): string {
  return `${row.attempts} of ${row.maxAttempts} attempts used`;
}

export type OutboxStandingTone = 'danger' | 'warning' | 'info' | 'neutral';

export interface OutboxStanding {
  readonly label: string;
  readonly tone: OutboxStandingTone;
  readonly title: string;
}

/**
 * The badge for an outbox row's status. `failed` exists in the status union but
 * the processor's failure path writes `pending` (for another try) or `dead`
 * (for none) — a row actually at `failed` is between states and says so.
 */
export function outboxStatusBadge(status: string): OutboxStanding {
  switch (status) {
    case 'dead':
      return {
        label: 'Dead letter',
        tone: 'danger',
        title: 'Every attempt failed. Nothing will pick this up again on its own.',
      };
    case 'failed':
      return {
        label: 'Failed (between states)',
        tone: 'warning',
        title: 'The processor writes pending for another try, or dead when tries run out.',
      };
    case 'processing':
      return {
        label: 'Processing',
        tone: 'info',
        title: 'A worker has claimed this event. Claims older than a minute are reclaimed.',
      };
    case 'pending':
      return {
        label: 'Waiting',
        tone: 'neutral',
        title: 'Queued for the next processor run (every five minutes).',
      };
    default:
      return { label: `Status: ${status}`, tone: 'neutral', title: 'An unrecognised status.' };
  }
}

export function emailStatusBadge(status: string): OutboxStanding {
  switch (status) {
    case 'failed':
      return {
        label: 'Failed',
        tone: 'danger',
        title: 'All in-process retries were exhausted. Nothing re-drives this automatically.',
      };
    case 'queued':
      return {
        label: 'Queued',
        tone: 'info',
        title: 'Waiting to be dispatched by the email pipeline.',
      };
    case 'sending':
      return {
        label: 'Sending',
        tone: 'info',
        title: 'Dispatch is in flight.',
      };
    default:
      return { label: `Status: ${status}`, tone: 'neutral', title: 'An unrecognised status.' };
  }
}

/** The sentence for a full scan, mirroring the other bounded lists. */
export function describeJobsScanBound(atLeast: boolean, scanLimit: number): string | null {
  return atLeast
    ? `The scan stops at ${scanLimit} documents and there were more. Some rows may not be listed.`
    : null;
}
