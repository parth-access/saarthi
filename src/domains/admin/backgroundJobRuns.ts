/**
 * The scheduled jobs an admin may run on demand, and how a run's result reads.
 *
 * Each job is the same handler the five-minute scheduler calls, run once, now.
 * Every one is idempotent by design (the scheduler and its daily backup already
 * overlap), so "run now" can only do what the next tick would have done a few
 * minutes later — which is exactly why it is safe to offer.
 */

export const RUNNABLE_JOB_IDS = [
  'process-outbox',
  'session-reminders',
  'retry-calendar',
  'process-refunds',
  'session-completion',
] as const;

export type RunnableJobId = (typeof RUNNABLE_JOB_IDS)[number];

export interface RunnableJob {
  readonly id: RunnableJobId;
  readonly label: string;
  /** What one run does, in the operator's words. */
  readonly does: string;
  /** Why someone would run it now instead of waiting. */
  readonly when: string;
  /** True when a run can move money, so the confirmation says so. */
  readonly movesMoney: boolean;
}

export const RUNNABLE_JOBS: readonly RunnableJob[] = [
  {
    id: 'process-outbox',
    label: 'Deliver queued events',
    does: 'Works through up to 25 waiting outbox events: emails, calendar syncs and metrics.',
    when: 'After replaying dead events, or when emails look stuck.',
    movesMoney: false,
  },
  {
    id: 'session-reminders',
    label: 'Send session reminders',
    does: 'Sends the 24-hour and 1-hour reminders that are due. Each reminder is sent once.',
    when: 'When a client says they were not reminded.',
    movesMoney: false,
  },
  {
    id: 'retry-calendar',
    label: 'Retry Meet links',
    does: 'Retries Google Calendar for confirmed sessions that have no Meet link yet.',
    when: 'After a calendar outage, before sessions start.',
    movesMoney: false,
  },
  {
    id: 'process-refunds',
    label: 'Process refunds',
    does: 'Sends due refunds to Razorpay and records the outcome. A refund already sent is never sent twice.',
    when: 'When a client is waiting on a refund that shows as owed.',
    movesMoney: true,
  },
  {
    id: 'session-completion',
    label: 'Close finished sessions',
    does: 'Marks sessions whose end time has passed as completed and sends follow-ups.',
    when: 'When yesterday’s sessions still show as confirmed.',
    movesMoney: false,
  },
];

export function isRunnableJobId(value: unknown): value is RunnableJobId {
  return typeof value === 'string' && (RUNNABLE_JOB_IDS as readonly string[]).includes(value);
}

export interface JobRunFigure {
  readonly label: string;
  readonly value: number;
}

const FIGURE_LABELS: Record<string, string> = {
  processed: 'processed',
  failed: 'failed',
  scanned: 'checked',
  stillPending: 'still pending',
  sent: 'sent',
  skipped: 'skipped',
  retried: 'retried',
  succeeded: 'succeeded',
  completed: 'completed',
  remindersSent: 'reminders sent',
};

/**
 * The counts a job reported, as labelled figures. Only numeric top-level fields
 * are read, so a handler adding a field never breaks the page, and nothing that
 * is not a count is shown as one.
 */
export function jobRunFigures(body: unknown): JobRunFigure[] {
  if (!body || typeof body !== 'object') return [];
  return Object.entries(body as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .map(([key, value]) => ({
      label: FIGURE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase(),
      value,
    }));
}
