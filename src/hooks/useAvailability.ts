import { useState, useEffect } from 'react';
import { therapistService } from '../services/therapistService';
import { TherapistAvailabilityRule, TherapistOverride } from '../types';

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

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

  const parsedBreaks = breaks.map(b => ({
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
      // jump to the end of the break that overlaps (take the max end if multiple)
      const overlappingBreakInfo = parsedBreaks.find(b => (sessionStart < b.end && sessionEnd > b.start));
      currentM = overlappingBreakInfo ? overlappingBreakInfo.end : currentM + durationMin + cooldownMin;
      continue;
    }

    slots.push(minutesToTime(sessionStart));
    currentM += durationMin + cooldownMin;
  }
  return slots;
}

export function useAvailability(therapistId: string | null, date: string | null) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!therapistId || !date) return;
    
    let mounted = true;
    setLoading(true);
    
    Promise.allSettled([
      therapistService.getAvailabilityRules(therapistId),
      therapistService.getOverrides(therapistId),
      fetch(`/api/availability?therapistId=${therapistId}&date=${date}`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch availability');
        return res.json();
      })
    ]).then((results) => {
      if (!mounted) return;

      const rules: TherapistAvailabilityRule[] =
        results[0].status === "fulfilled" ? results[0].value : [];
        
      const overrides: TherapistOverride[] = 
        results[1].status === "fulfilled" ? results[1].value : [];

      const availabilityData =
        results[2].status === "fulfilled"
          ? results[2].value
          : { bookedTimes: [], lockedTimes: [] };
      
      const [year, month, day] = date.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();

      // Check overrides first
      const dateOverride = overrides.find(o => o.date === date);

      const availableTimes = new Set<string>();

      if (dateOverride) {
        if (dateOverride.type === 'available' && dateOverride.startTime && dateOverride.endTime) {
            const generated = generateTimeSlots(
              dateOverride.startTime, 
              dateOverride.endTime, 
              dateOverride.slotDuration || 60, 
              dateOverride.cooldownGap || 0, 
              dateOverride.breaks || []
            );
            generated.forEach(t => availableTimes.add(t));
        }
        // If blocked, availableTimes remains empty
      } else {
        const matchingRules = rules.filter(r => r.dayOfWeek === dayOfWeek && r.isActive);
        matchingRules.forEach(rule => {
          const generated = generateTimeSlots(
            rule.startTime, 
            rule.endTime, 
            rule.slotDuration, 
            rule.cooldownGap || 0,
            rule.breaks || []
          );
          generated.forEach(t => availableTimes.add(t));
        });
      }

      const { bookedTimes = [], lockedTimes = [] } = availabilityData;
      
      const slotObjects: Slot[] = Array.from(availableTimes).sort().map(time => {
        const isBooked = bookedTimes.includes(time);
        const isLocked = lockedTimes.includes(time);
        let reason = null;
        if (isBooked) reason = 'Booked';
        else if (isLocked) reason = 'Locked';
        else if (dateOverride?.type === 'blocked') reason = dateOverride.reason || 'Unavailable';

        return {
          time,
          isAvailable: !isBooked && !isLocked && dateOverride?.type !== 'blocked',
          reason
        };
      });
      
      setSlots(slotObjects);
      setLoading(false);
    }).catch(err => {
      if (!mounted) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
      
    return () => { mounted = false };
  }, [therapistId, date]);

  return { slots, loading, error };
}

