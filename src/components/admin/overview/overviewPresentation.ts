/**
 * The overview's wording: how a phase and a day are put into words.
 *
 * Small, but kept out of the component and tested, because both of these are
 * read as a summary and then acted on. "4 sessions today" when one of them has a
 * time nobody can parse is a lie of omission — the operator will not find the
 * fourth in the list, and will assume they miscounted rather than that the row is
 * broken. So the count always adds up out loud.
 */
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import type {
  AttentionQueueDefinition,
  SessionPhase,
  TodaySchedule,
} from '@/domains/admin/overviewTriage';
import { ADMIN_NAV_ITEMS, resolveAdminNavItem } from '../shell/navigation';

export interface PhasePresentation {
  readonly label: string;
  readonly tone: AdminTone;
  /** Why the badge says what it does, for the row's title attribute. */
  readonly title: string;
}

/**
 * A session's position in the day, against the clock rather than its status.
 *
 * `done` is deliberately not called "completed": the phase is derived from the
 * slot having passed, and `session-completion` may not have run yet. Saying
 * "completed" would claim a status transition that has not necessarily happened.
 */
export function phasePresentation(phase: SessionPhase): PhasePresentation {
  switch (phase) {
    case 'now':
      return {
        label: 'In progress',
        tone: 'success',
        title: 'The session slot has started and has not finished yet.',
      };
    case 'next':
      return {
        label: 'Next',
        tone: 'info',
        title: 'The first session still to start today.',
      };
    case 'later':
      return {
        label: 'Later today',
        tone: 'neutral',
        title: 'Scheduled later today.',
      };
    case 'done':
      return {
        label: 'Slot passed',
        tone: 'neutral',
        title:
          'The slot has passed. This is the clock, not the booking status — session completion runs on its own schedule.',
      };
    case 'unknown':
      return {
        label: 'Time unreadable',
        tone: 'warning',
        title: 'The stored date and time could not be turned into an instant, so this row has no place in the day.',
      };
  }
}

/**
 * The day in one sentence.
 *
 * Every session is accounted for in exactly one clause, including the ones whose
 * time could not be read, so the parts always sum to the total.
 */
export function describeDayProgress<TRow>(schedule: TodaySchedule<TRow>): string {
  if (schedule.total === 0) return 'No sessions scheduled today.';

  const parts: string[] = [];
  if (schedule.done > 0) parts.push(`${schedule.done} passed`);
  if (schedule.inProgress > 0) parts.push(`${schedule.inProgress} in progress`);
  if (schedule.remaining > 0) parts.push(`${schedule.remaining} still to come`);
  if (schedule.unreadable > 0) {
    parts.push(
      schedule.unreadable === 1
        ? '1 with an unreadable time'
        : `${schedule.unreadable} with unreadable times`
    );
  }

  const noun = schedule.total === 1 ? 'session' : 'sessions';
  return `${schedule.total} ${noun} today: ${parts.join(', ')}.`;
}

export interface QueueDestination {
  /** Where the button goes, or `null` when there is nowhere real to send anyone. */
  readonly href: string | null;
  readonly cta: string;
  /** What the operator needs to know that the button cannot say. */
  readonly note: string | null;
}

/** The section a queue's link lands in, ignoring its query string. */
function sectionFor(href: string) {
  return resolveAdminNavItem(href.split('?')[0]);
}

function sectionNamed(label: string) {
  return ADMIN_NAV_ITEMS.find((item) => item.label === label) ?? null;
}

/**
 * Where a queue is acted on, and whether that place exists yet.
 *
 * Resolved against the navigation model rather than hardcoded, for one reason:
 * this console is being built in increments, and a queue whose section is still a
 * placeholder must not render a button that lands on "not built yet". Reading
 * `status` from the same declaration the sidebar reads means the link appears by
 * itself the moment that section ships, and cannot appear before.
 *
 * A queue that carries its own `href` uses it — `missing_meet_link` points at the
 * bookings list because that is where the affected sessions can be seen today,
 * even though retrying them belongs to Calendar & Meet. The note is what keeps
 * that from being misleading.
 */
export function queueDestination(definition: AttentionQueueDefinition): QueueDestination {
  const owner = sectionNamed(definition.handledIn);

  if (definition.href) {
    const landing = sectionFor(definition.href);
    const landsWhereItIsHandled = landing?.label === definition.handledIn;
    return {
      href: definition.href,
      cta: `Open in ${landing?.label ?? definition.handledIn}`,
      note:
        landsWhereItIsHandled || owner?.status === 'ready'
          ? null
          : `Resolving these belongs to ${definition.handledIn}, which is not built yet.`,
    };
  }

  if (owner?.status === 'ready') {
    return { href: owner.href, cta: `Open in ${owner.label}`, note: null };
  }

  return {
    href: null,
    cta: `Handled in ${definition.handledIn}`,
    note: `${definition.handledIn} is not built yet, so there is nowhere to send you.`,
  };
}
