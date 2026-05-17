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
    
    Promise.allSettled([
      therapistService.getAvailabilityRules(therapistId),
      bookingService.getBookingsByDate(therapistId, date),
      bookingService.getLockedSlotsByDate(therapistId, date)
    ]).then((results) => {
      if (!mounted) return;
      
      console.log("Availability Debug:", results);

      const rules =
        results[0].status === "fulfilled"
          ? results[0].value
          : [];

      const bookingsData =
        results[1].status === "fulfilled"
          ? results[1].value
          : [];

      const lockedSlots =
        results[2].status === "fulfilled"
          ? results[2].value
          : [];
      
      const [year, month, day] = date.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();

      const matchingRules = rules.filter((r: { dayOfWeek: number }) => r.dayOfWeek === dayOfWeek);
      // Create a set of all possible times across all matching rules for this day
      const availableTimes = new Set<string>();
      matchingRules.forEach((rule: { startTime: string; endTime: string; slotDuration: number }) => {
        const generated = generateTimeSlots(rule.startTime, rule.endTime, rule.slotDuration);
        generated.forEach(t => availableTimes.add(t));
      });

      const bookedTimes = bookingsData
        .filter((b: { status: string; time: string }) => b.status === "pending" || b.status === "pending_approval" || b.status === "awaiting_payment" || b.status === "confirmed")
        .map((b: { time: string }) => b.time);

      const lockedTimes = lockedSlots.map((l: { time: string }) => l.time);
      
      const slotObjects: Slot[] = Array.from(availableTimes).sort().map((time: string) => {
        const isBooked = bookedTimes.includes(time);
        const isLocked = lockedTimes.includes(time);
        return {
          time,
          isAvailable: !isBooked && !isLocked,
          reason: isBooked ? 'Booked' : isLocked ? 'Locked' : null
        };
      });
      
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

