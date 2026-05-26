import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { TherapistAvailabilityRule, TherapistOverride } from '@/types';

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMin: number,
  cooldownMin: number,
  breaks: { startTime: string; endTime: string }[] = []
): string[] {
  const slots: string[] = [];
  const startTotalM = timeToMinutes(startTime);
  const endTotalM = timeToMinutes(endTime);

  const parsedBreaks = (breaks || []).map(b => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime)
  }));

  let currentM = startTotalM;

  while (currentM + durationMin <= endTotalM) {
    const sessionStart = currentM;
    const sessionEnd = currentM + durationMin;

    // Check if overlaps with any break
    const overlapsBreak = parsedBreaks.some(
      b => (sessionStart < b.end && sessionEnd > b.start)
    );

    if (overlapsBreak) {
      // jump to the end of the break that overlaps (take the first overlapping break's end)
      const overlappingBreakInfo = parsedBreaks.find(b => (sessionStart < b.end && sessionEnd > b.start));
      currentM = overlappingBreakInfo ? overlappingBreakInfo.end : currentM + durationMin + cooldownMin;
      continue;
    }

    slots.push(minutesToTime(sessionStart));
    currentM += durationMin + cooldownMin;
  }
  return slots;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get('therapistId');
    const date = searchParams.get('date');

    if (!therapistId || !date) {
      return NextResponse.json(
        { error: 'therapistId and date are required' },
        { status: 400 }
      );
    }

    // Local-safe date parsing
    const [year, month, day] = date.split('-').map(Number);
    const selectedDate = new Date(year, month - 1, day);
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 1 = Monday ...

    // Fetch recurring rules
    const rulesPromise = adminDb
      .collection('therapistAvailability')
      .doc(therapistId)
      .collection('recurringRules')
      .get();

    // Fetch overrides
    const overridesPromise = adminDb
      .collection('therapistAvailability')
      .doc(therapistId)
      .collection('overrides')
      .get();

    // Fetch bookings for the therapist and date
    const bookingsPromise = adminDb
      .collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['pending', 'pending_approval', 'awaiting_payment', 'confirmed'])
      .get();

    // Fetch locked slots for the therapist and date
    const lockedSlotsPromise = adminDb
      .collection('locked_slots')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .get();

    const [rulesSnapshot, overridesSnapshot, bookingsSnapshot, lockedSlotsSnapshot] = await Promise.all([
      rulesPromise,
      overridesPromise,
      bookingsPromise,
      lockedSlotsPromise
    ]);

    const rules = rulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TherapistAvailabilityRule[];

    const overrides = overridesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as TherapistOverride[];

    const bookedTimes = bookingsSnapshot.docs.map((doc) => doc.data().time) as string[];

    const lockedTimes: string[] = [];
    const locksToDelete: string[] = [];

    lockedSlotsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      let isExpired = false;
      
      if (data?.expiresAt && typeof data.expiresAt.toDate === 'function' && data.expiresAt.toDate() < new Date()) {
        isExpired = true;
      } else if (data?.expiresAt && typeof data.expiresAt.toMillis === 'function' && data.expiresAt.toMillis() < Date.now()) {
        isExpired = true;
      } else if (data?.expiresAt && typeof data.expiresAt === 'number' && data.expiresAt < Date.now()) {
        isExpired = true;
      }
      
      if (isExpired) {
        locksToDelete.push(doc.id);
      } else {
        lockedTimes.push(data.time);
      }
    });

    // Cleanup stale locks in the background
    if (locksToDelete.length > 0) {
      Promise.all(locksToDelete.map(id => adminDb.collection('locked_slots').doc(id).delete())).catch(err => {
         console.error("Failed background cleanup of locked_slots", err);
      });
    }

    // Check overrides first
    const dateOverride = overrides.find(o => o.date === date);

    if (dateOverride?.type === 'blocked') {
      return NextResponse.json({
        availableSlots: [],
        bookedTimes,
        lockedTimes
      });
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
      const matchingRules = rules.filter(r => r.dayOfWeek === dayOfWeek && r.isActive !== false);
      const slotSet = new Set<string>();
      matchingRules.forEach(rule => {
        const slots = generateTimeSlots(
          rule.startTime,
          rule.endTime,
          rule.slotDuration,
          rule.cooldownGap !== undefined ? rule.cooldownGap : 0,
          rule.breaks || []
        );
        slots.forEach(s => slotSet.add(s));
      });
      possibleSlots = Array.from(slotSet).sort();
    }

    const availableSlots = possibleSlots.filter(
      time => !bookedTimes.includes(time) && !lockedTimes.includes(time)
    );

    return NextResponse.json({
      availableSlots,
      bookedTimes,
      lockedTimes
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
