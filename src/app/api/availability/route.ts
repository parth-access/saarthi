import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { TherapistAvailabilityRule, TherapistOverride } from '@/types';
import { firestoreBookingRepository } from '@/domains/booking';
import { verifySession } from '@/lib/auth/verifySession';
import { generateTimeSlots, slotTemporalReason } from '@/shared/scheduling/slots';

/**
 * Slot availability for one therapist on one IST calendar day.
 *
 * The response deliberately reports *why* a generated start time is not
 * offerable rather than omitting it, so a UI can grey it out instead of
 * pretending the therapist does not work then:
 *
 *   availableSlots     — offerable right now
 *   bookedTimes        — taken by an active booking
 *   lockedTimes        — held by someone else's live checkout
 *   pastTimes          — start instant already passed (IST)
 *   beyondWindowTimes  — outside the rolling booking window
 *
 * `excludeBookingId` exists for the reschedule flows. A booking being moved must
 * not count as a *competing* booking or lock to itself, but its own current
 * date/time is never a valid reschedule destination either, so the endpoint
 * drops that exact slot from `availableSlots`. Because that parameter changes
 * what the caller can learn about a booking, it is authorized: the caller must
 * be an admin, the assigned therapist, or the booking's owner. An unknown id
 * and an unowned id both return the same 403, so the endpoint cannot be used as
 * a booking-existence oracle.
 */

interface AvailabilityResponse {
  availableSlots: string[];
  bookedTimes: string[];
  lockedTimes: string[];
  pastTimes: string[];
  beyondWindowTimes: string[];
}

const EMPTY_DAY = (): AvailabilityResponse => ({
  availableSlots: [],
  bookedTimes: [],
  lockedTimes: [],
  pastTimes: [],
  beyondWindowTimes: [],
});

class AvailabilityAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AvailabilityAuthError';
  }
}

/**
 * The excluded booking's id plus its current date/time, so the availability
 * computation can both stop it blocking itself and refuse its own slot as a
 * reschedule destination. `null` when the caller did not ask for an exclusion.
 */
interface ExcludedBooking {
  id: string;
  date: string;
  time: string;
}

/**
 * Resolves `excludeBookingId` to an authorized booking, or throws. Returns
 * `null` when the caller did not ask for an exclusion.
 */
async function resolveExcludedBookingId(
  request: Request,
  excludeBookingId: string | null
): Promise<ExcludedBooking | null> {
  if (!excludeBookingId) return null;

  const session = await verifySession(request);
  if (!session) {
    throw new AvailabilityAuthError(401, 'Please sign in to view availability for this session.');
  }

  const booking = await firestoreBookingRepository.findById(excludeBookingId);

  // Uniform failure for "no such booking" and "not yours" — no existence oracle.
  const denied = new AvailabilityAuthError(403, 'You are not allowed to view availability for this session.');
  if (!booking) throw denied;

  if (session.role === 'admin') return { id: booking.id, date: booking.date, time: booking.time };

  if (session.role === 'therapist') {
    const therapistDoc = await adminDb.collection('therapists').doc(booking.therapistId).get();
    if (therapistDoc.exists && therapistDoc.data()?.authId === session.uid) {
      return { id: booking.id, date: booking.date, time: booking.time };
    }
    throw denied;
  }

  // Same ownership model as RescheduleBookingCommand: uid OR verified email,
  // because bookings created before sign-in carry only an email.
  const ownsByUid = !!session.uid && (booking.userId === session.uid || booking.email === session.uid);
  const ownsByEmail =
    !!session.email && !!booking.email && booking.email.toLowerCase() === session.email.toLowerCase();

  if (ownsByUid || ownsByEmail) return { id: booking.id, date: booking.date, time: booking.time };
  throw denied;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get('therapistId');
    const date = searchParams.get('date');

    if (!therapistId || !date) {
      return NextResponse.json({ error: 'therapistId and date are required' }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    }

    let excludedBooking: ExcludedBooking | null;
    try {
      excludedBooking = await resolveExcludedBookingId(request, searchParams.get('excludeBookingId'));
    } catch (authError) {
      if (authError instanceof AvailabilityAuthError) {
        return NextResponse.json({ error: authError.message }, { status: authError.status });
      }
      throw authError;
    }

    // Weekday of the requested calendar date, computed in UTC so the server's own
    // timezone cannot shift it. (A date-only value has no timezone of its own.)
    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday

    const rulesPromise = adminDb
      .collection('therapistAvailability')
      .doc(therapistId)
      .collection('recurringRules')
      .get();

    const overridesPromise = adminDb
      .collection('therapistAvailability')
      .doc(therapistId)
      .collection('overrides')
      .get();

    const bookingsPromise = firestoreBookingRepository.findActiveBookingsByTherapistAndDate(therapistId, date);

    const lockedSlotsPromise = adminDb
      .collection('locked_slots')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .get();

    const [rulesSnapshot, overridesSnapshot, bookingsList, lockedSlotsSnapshot] = await Promise.all([
      rulesPromise,
      overridesPromise,
      bookingsPromise,
      lockedSlotsPromise,
    ]);

    const rules = rulesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TherapistAvailabilityRule[];
    const overrides = overridesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as TherapistOverride[];

    // A booking never blocks itself: its own active-booking row and its own slot
    // pin must not make its own session look like somebody else's reservation.
    // (Whether that own slot is then *offerable* is decided below — it is not.)
    const bookedTimes = bookingsList
      .filter((booking) => !excludedBooking || booking.id !== excludedBooking.id)
      .map((booking) => booking.time);

    const lockedTimes: string[] = [];
    const locksToDelete: string[] = [];

    lockedSlotsSnapshot.docs.forEach((doc) => {
      const data = doc.data();

      // The excluded booking's own pin — permanent (paid) or held (unpaid) — is
      // its own reservation, not a competing one.
      if (excludedBooking && data?.bookingId === excludedBooking.id) {
        return;
      }

      // Permanent pins belong to confirmed bookings and are already represented
      // in bookedTimes; counting them twice renders a slot as BOOKED and LOCKED.
      if (data?.isPermanent === true || data?.status === 'booked') {
        return;
      }

      // Missing or unparseable expiresAt => treat as expired (legacy/orphan docs).
      let expiresMs: number | null = null;
      const raw = data?.expiresAt;
      if (raw && typeof raw.toMillis === 'function') {
        expiresMs = raw.toMillis();
      } else if (raw && typeof raw.toDate === 'function') {
        expiresMs = raw.toDate().getTime();
      } else if (typeof raw === 'number') {
        expiresMs = raw;
      }

      if (expiresMs === null || expiresMs < Date.now()) {
        locksToDelete.push(doc.id);
      } else {
        lockedTimes.push(data.time);
      }
    });

    // Cleanup stale locks in the background
    if (locksToDelete.length > 0) {
      Promise.all(locksToDelete.map((id) => adminDb.collection('locked_slots').doc(id).delete())).catch((err) => {
        console.error('Failed background cleanup of locked_slots', err);
      });
    }

    const dateOverride = overrides.find((o) => o.date === date);

    if (dateOverride?.type === 'blocked') {
      return NextResponse.json({ ...EMPTY_DAY(), bookedTimes, lockedTimes });
    }

    let possibleSlots: string[] = [];

    if (dateOverride?.type === 'available' && dateOverride.startTime && dateOverride.endTime) {
      possibleSlots = generateTimeSlots(
        dateOverride.startTime,
        dateOverride.endTime,
        dateOverride.slotDuration || 60,
        dateOverride.cooldownGap !== undefined ? dateOverride.cooldownGap : 0,
        dateOverride.breaks || []
      );
    } else {
      const matchingRules = rules.filter((r) => r.dayOfWeek === dayOfWeek && r.isActive !== false);
      const slotSet = new Set<string>();
      matchingRules.forEach((rule) => {
        generateTimeSlots(
          rule.startTime,
          rule.endTime,
          rule.slotDuration,
          rule.cooldownGap !== undefined ? rule.cooldownGap : 0,
          rule.breaks || []
        ).forEach((s) => slotSet.add(s));
      });
      possibleSlots = Array.from(slotSet).sort();
    }

    // Temporal filtering is done HERE, once, against the same IST rule the
    // booking/reschedule commands enforce — not in each component that happens to
    // render a grid. One frozen `now` keeps the partition self-consistent.
    const nowMs = Date.now();
    const pastTimes: string[] = [];
    const beyondWindowTimes: string[] = [];

    possibleSlots.forEach((time) => {
      const reason = slotTemporalReason(date, time, nowMs);
      if (reason === 'past') pastTimes.push(time);
      else if (reason === 'beyond_window') beyondWindowTimes.push(time);
    });

    const availableSlots = possibleSlots.filter(
      (time) =>
        !bookedTimes.includes(time) &&
        !lockedTimes.includes(time) &&
        !pastTimes.includes(time) &&
        !beyondWindowTimes.includes(time) &&
        // A booking's own current slot is never a valid reschedule destination.
        // It was excluded from `bookedTimes` above so it would otherwise re-enter
        // the offerable set; drop it here instead of offering it.
        !(excludedBooking && excludedBooking.date === date && time === excludedBooking.time)
    );

    const response: AvailabilityResponse = {
      availableSlots,
      bookedTimes,
      lockedTimes,
      pastTimes,
      beyondWindowTimes,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
