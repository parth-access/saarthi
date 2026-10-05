/**
 * Canonical slot-scheduling rules for Saarthi.
 *
 * This module is the SINGLE source of truth for two things that were previously
 * duplicated (and therefore able to drift):
 *
 *  1. **Cadence** — how a therapist's working window is cut into bookable start
 *     times. The generator used to exist twice: once at module scope in
 *     `src/app/api/availability/route.ts` (which *lists* slots) and once inline
 *     inside `SlotReservationService.isSlotInTherapistAvailability` (which
 *     *validates* a submitted slot). Two copies of the same rule means the
 *     lister and the validator can disagree, and a slot can be offered that the
 *     server then rejects.
 *
 *  2. **Temporality** — whether a start time has already passed, or falls
 *     outside the rolling booking window, evaluated in Asia/Kolkata (IST).
 *     This rule previously existed ONLY inside the `SlotStep` React component,
 *     so every other consumer of `/api/availability` silently lacked it: the
 *     dashboard reschedule dialog happily offered same-day slots that had
 *     already passed, and the server rejected them with a 400.
 *
 * IST is UTC+05:30 all year (no DST), but "today" is still not derivable from
 * the browser clock — a user in another timezone, or with a skewed clock, gets a
 * different calendar day. Every date here is therefore an explicit IST calendar
 * day, and every instant comparison goes through the same +05:30 conversion the
 * booking commands use.
 *
 * SESSION LENGTH and CADENCE:
 * Saarthi sessions are 45 minutes long and the therapist slot rules generate
 * the matching 45-minute cadence (`slotDuration: 45, cooldownGap: 0`), so a
 * session occupies exactly its start slot: 09:00–09:45, then 09:45–10:30, and
 * so on. `SESSION_DURATION_MINUTES` (45, in `@/shared/constants`) is the
 * *displayed* and *calendar* length; the cadence comes from each therapist's
 * Firestore rule. Do not make one drift from the other: a session longer than
 * the cadence would overlap the next booked start.
 */

import { istToUtcIsoString } from '@/shared/utils/dateTime';
import { BOOKING_WINDOW_DAYS } from '@/shared/constants';

export interface AvailabilityBreak {
  startTime: string;
  endTime: string;
}

/** 'HH:MM' → minutes since midnight. Returns NaN for unparseable input. */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = String(timeStr).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** Minutes since midnight → zero-padded 'HH:MM'. */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Cuts `startTime`..`endTime` into session start times, stepping by
 * `durationMin + cooldownMin` and skipping any step whose session would overlap
 * a break (jumping to the end of the offending break instead).
 *
 * A slot is only emitted when the whole session fits before `endTime`.
 */
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMin: number,
  cooldownMin: number,
  breaks: AvailabilityBreak[] = []
): string[] {
  const slots: string[] = [];
  const startTotalM = timeToMinutes(startTime);
  const endTotalM = timeToMinutes(endTime);
  const duration = Number(durationMin);
  const cooldown = Number.isFinite(Number(cooldownMin)) ? Number(cooldownMin) : 0;

  // A non-positive step would loop forever; an unparseable window has no slots.
  if (!Number.isFinite(startTotalM) || !Number.isFinite(endTotalM)) return slots;
  if (!Number.isFinite(duration) || duration <= 0) return slots;
  if (duration + cooldown <= 0) return slots;

  const parsedBreaks = (breaks || [])
    .map((b) => ({ start: timeToMinutes(b?.startTime), end: timeToMinutes(b?.endTime) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);

  let currentM = startTotalM;

  while (currentM + duration <= endTotalM) {
    const sessionStart = currentM;
    const sessionEnd = currentM + duration;

    const overlappingBreak = parsedBreaks.find((b) => sessionStart < b.end && sessionEnd > b.start);
    if (overlappingBreak) {
      // Jump past the break rather than emitting a colliding start.
      const next = overlappingBreak.end;
      currentM = next > currentM ? next : currentM + duration + cooldown;
      continue;
    }

    slots.push(minutesToTime(sessionStart));
    currentM += duration + cooldown;
  }

  return slots;
}

export interface IstNow {
  /** IST calendar day, 'YYYY-MM-DD'. */
  date: string;
  /** IST wall-clock time, 'HH:MM' (24h). */
  time: string;
  /** The instant this was derived from, in epoch millis. */
  epochMs: number;
}

/**
 * "Now", expressed as an IST calendar day + wall-clock time. Use this instead of
 * `new Date()` whenever a `YYYY-MM-DD` or `HH:MM` is needed, on either side of
 * the wire — the browser's local calendar day is not the product's calendar day.
 */
export function getIstNow(now: Date = new Date()): IstNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  // `hour12: false` can render midnight as '24' in some ICU versions.
  const hour = get('hour') === '24' ? '00' : get('hour');

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}`,
    epochMs: now.getTime(),
  };
}

/**
 * The IST calendar day `offsetDays` after the IST day containing `now`.
 * Arithmetic is done on the IST calendar date itself, so it cannot be dragged
 * across a boundary by the caller's timezone.
 */
export function istDatePlusDays(offsetDays: number, now: Date = new Date()): string {
  const [y, m, d] = getIstNow(now).date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The instant a slot starts, in epoch millis, or `null` when the date/time is
 * unparseable. Uses the same IST→UTC conversion as the booking commands, so a
 * slot judged bookable here is judged bookable there.
 */
export function slotStartEpochMs(date: string, time: string): number | null {
  const iso = istToUtcIsoString(date, time);
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * True when the slot's start instant has already passed.
 *
 * Deliberately compared at millisecond precision against the same rule
 * `RescheduleBookingCommand` and `CreateBookingCommand` enforce
 * (`slotStart < now`), so the list a user sees and the validation they hit
 * cannot disagree. An unparseable slot counts as past (not offerable).
 */
export function isSlotInPast(date: string, time: string, nowMs: number = Date.now()): boolean {
  const start = slotStartEpochMs(date, time);
  if (start === null) return true;
  return start < nowMs;
}

/**
 * True when the slot starts beyond the rolling booking window. Mirrors the
 * server rule exactly: `now + BOOKING_WINDOW_DAYS × 24h`, a rolling instant —
 * NOT "the end of the 14th calendar day". A UI that offers whole calendar days
 * must therefore still filter per-slot, or the late slots on the final day are
 * offered and then rejected.
 */
export function isSlotBeyondBookingWindow(
  date: string,
  time: string,
  nowMs: number = Date.now(),
  windowDays: number = BOOKING_WINDOW_DAYS
): boolean {
  const start = slotStartEpochMs(date, time);
  if (start === null) return true;
  return start > nowMs + windowDays * 24 * 60 * 60 * 1000;
}

/** Why a generated start time is not offerable, or `null` when it is. */
export type SlotTemporalReason = 'past' | 'beyond_window';

export function slotTemporalReason(
  date: string,
  time: string,
  nowMs: number = Date.now()
): SlotTemporalReason | null {
  if (isSlotInPast(date, time, nowMs)) return 'past';
  if (isSlotBeyondBookingWindow(date, time, nowMs)) return 'beyond_window';
  return null;
}
