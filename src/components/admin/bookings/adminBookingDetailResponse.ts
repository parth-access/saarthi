/**
 * How a response from `GET /api/admin/bookings/[bookingId]` becomes what the
 * screen shows.
 *
 * Same reasoning as `adminBookingsResponse.ts`, and it shares that module's error
 * copy and race guard rather than restating them. One thing is modelled
 * differently: a 404 is not folded into the error string.
 *
 * A missing booking and a failed read look identical if both are "an error
 * message", and they call for opposite responses from an operator — one means
 * check the id you followed, the other means try again. So `notFound` is its own
 * outcome, and the screen offers a retry only where retrying could work.
 */
import type {
  AdminBookingActionVerdict,
  AdminBookingDetail,
  AdminTimelineEntry,
} from '@/domains/booking/queries/adminBookingDetail';
import type { TimelineGap } from '@/domains/audit/BookingAuditTrail';
import { GENERIC_BOOKINGS_ERROR, BOOKINGS_ACCESS_ERROR } from './adminBookingsResponse';

export {
  GENERIC_BOOKINGS_ERROR,
  BOOKINGS_ACCESS_ERROR,
  BOOKINGS_SESSION_ERROR,
  createLatestRequestGuard,
} from './adminBookingsResponse';

export const BOOKING_NOT_FOUND_ERROR = 'No booking exists with that id.';

export interface AdminBookingTimeline {
  readonly entries: readonly AdminTimelineEntry[];
  /** Halves of the trail that could not be read. The screen states these. */
  readonly gaps: readonly TimelineGap[];
  readonly truncated: boolean;
}

export interface AdminBookingDetailPayload {
  readonly booking: AdminBookingDetail;
  readonly timeline: AdminBookingTimeline;
  readonly actions: readonly AdminBookingActionVerdict[];
}

export type AdminBookingDetailInterpretation =
  | { readonly ok: true; readonly payload: AdminBookingDetailPayload }
  | { readonly ok: false; readonly notFound: true; readonly error: string }
  | { readonly ok: false; readonly notFound: false; readonly error: string };

function messageIn(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function isDetail(value: unknown): value is AdminBookingDetail {
  if (!value || typeof value !== 'object') return false;
  const detail = value as Record<string, unknown>;
  // Enough to know this is the projection and not some other booking shape: the
  // grouped objects the screen reads unconditionally must all be present, or it
  // would throw on the first field access.
  return (
    typeof detail.id === 'string' &&
    typeof detail.status === 'string' &&
    typeof detail.client === 'object' &&
    detail.client !== null &&
    typeof detail.session === 'object' &&
    detail.session !== null &&
    typeof detail.payment === 'object' &&
    detail.payment !== null &&
    typeof detail.refund === 'object' &&
    detail.refund !== null &&
    typeof detail.meeting === 'object' &&
    detail.meeting !== null &&
    typeof detail.notifications === 'object' &&
    detail.notifications !== null &&
    typeof detail.outcome === 'object' &&
    detail.outcome !== null &&
    typeof detail.reschedule === 'object' &&
    detail.reschedule !== null &&
    typeof detail.access === 'object' &&
    detail.access !== null
  );
}

function isTimeline(value: unknown): value is AdminBookingTimeline {
  if (!value || typeof value !== 'object') return false;
  const timeline = value as Record<string, unknown>;
  return (
    Array.isArray(timeline.entries) &&
    Array.isArray(timeline.gaps) &&
    typeof timeline.truncated === 'boolean'
  );
}

function isActions(value: unknown): value is readonly AdminBookingActionVerdict[] {
  return (
    Array.isArray(value) &&
    value.every(
      (verdict) =>
        verdict &&
        typeof verdict === 'object' &&
        typeof verdict.action === 'string' &&
        typeof verdict.allowed === 'boolean' &&
        typeof verdict.reason === 'string'
    )
  );
}

export function interpretAdminBookingDetailResponse(
  status: number,
  body: unknown
): AdminBookingDetailInterpretation {
  if (status === 401 || status === 403) {
    return { ok: false, notFound: false, error: BOOKINGS_ACCESS_ERROR };
  }
  if (status === 404) {
    return { ok: false, notFound: true, error: messageIn(body) ?? BOOKING_NOT_FOUND_ERROR };
  }
  if (status < 200 || status >= 300) {
    // A 400 here names what was wrong with the id. Worth showing as written.
    return { ok: false, notFound: false, error: messageIn(body) ?? GENERIC_BOOKINGS_ERROR };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, notFound: false, error: GENERIC_BOOKINGS_ERROR };
  }
  const candidate = body as Record<string, unknown>;

  if (candidate.success === false) {
    return { ok: false, notFound: false, error: messageIn(body) ?? GENERIC_BOOKINGS_ERROR };
  }
  if (
    !isDetail(candidate.booking) ||
    !isTimeline(candidate.timeline) ||
    !isActions(candidate.actions)
  ) {
    // Rendering a partial detail view is worse than saying the read failed: an
    // operator would act on a booking whose state they cannot fully see.
    return { ok: false, notFound: false, error: GENERIC_BOOKINGS_ERROR };
  }

  return {
    ok: true,
    payload: {
      booking: candidate.booking,
      timeline: candidate.timeline,
      actions: candidate.actions,
    },
  };
}

/**
 * What to say about a timeline that could not be fully read.
 *
 * Returns `null` when the trail is complete — there is nothing to state, and a
 * reassuring "history loaded successfully" banner would just be noise.
 */
export function describeTimelineGaps(timeline: AdminBookingTimeline): string | null {
  const notes: string[] = [];

  if (timeline.gaps.includes('booking') && timeline.gaps.includes('system')) {
    notes.push('No history could be read for this booking.');
  } else if (timeline.gaps.includes('booking')) {
    notes.push('Status and reschedule history could not be read, so events are missing below.');
  } else if (timeline.gaps.includes('system')) {
    notes.push('Payment, slot and refund history could not be read, so events are missing below.');
  }

  if (timeline.truncated) {
    notes.push(
      'This booking has more recorded events than can be shown, and these may not be the most recent.'
    );
  }

  return notes.length > 0 ? notes.join(' ') : null;
}
