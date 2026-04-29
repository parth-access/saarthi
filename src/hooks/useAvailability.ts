import { useState, useEffect } from 'react';
import { therapistService } from '../services/therapistService';
import { bookingService } from '../services/bookingService';

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

function generateTimeSlots(startTime: string, endTime: string, durationMin: number): string[] {
  const slots: string[] = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startTotalM = startH * 60 + startM;
  const endTotalM = endH * 60 + endM;
  
  let currentTotalM = startTotalM;

  while (currentTotalM + durationMin <= endTotalM) {
    const h = Math.floor(currentTotalM / 60).toString().padStart(2, '0');
    const m = (currentTotalM % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    currentTotalM += durationMin;
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
    
    Promise.all([
      therapistService.getAvailabilityRules(therapistId),
      bookingService.getBookingsByDate(therapistId, date)
    ]).then(([rules, bookingsData]) => {
      if (!mounted) return;
      
      const dateStrLocal = `${date}T00:00:00`;
      const dateObj = new Date(dateStrLocal);
      const dayOfWeek = dateObj.getDay();

      const matchingRules = rules.filter(r => r.dayOfWeek === dayOfWeek);
      // Create a set of all possible times across all matching rules for this day
      let availableTimes = new Set<string>();
      matchingRules.forEach(rule => {
        const generated = generateTimeSlots(rule.startTime, rule.endTime, rule.slotDuration);
        generated.forEach(t => availableTimes.add(t));
      });

      const bookedTimes = bookingsData
        .filter(b => b.status === "pending" || b.status === "confirmed")
        .map(b => b.time);
      
      const slotObjects: Slot[] = Array.from(availableTimes).sort().map((time: string) => ({
        time,
        isAvailable: !bookedTimes.includes(time),
        reason: bookedTimes.includes(time) ? 'Booked' : null
      }));
      
      setSlots(slotObjects);
      setLoading(false);
    }).catch(err => {
      if (!mounted) return;
      setError(err.message);
      setLoading(false);
    });
      
    return () => { mounted = false };
  }, [therapistId, date]);

  return { slots, loading, error };
}

