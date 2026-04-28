import { useState, useEffect } from 'react';
import { therapistService } from '../services/therapistService';

interface Slot {
  time: string;
  isAvailable: boolean;
  reason: string | null;
}

export function useAvailability(therapistId: string | null, date: string | null) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!therapistId || !date) return;
    
    let mounted = true;
    setLoading(true);
    
    therapistService.getAvailability(therapistId)
      .then(data => {
        if (!mounted) return;
        
        const availableTimes = data[date] || [];
        
        // Define all possible slots (e.g., 9 AM to 5 PM)
        const allSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
        
        const slotObjects: Slot[] = allSlots.map(time => ({
          time,
          isAvailable: availableTimes.includes(time),
          reason: availableTimes.includes(time) ? null : 'Booked'
        }));
        
        setSlots(slotObjects);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted) return;
        setError(err.message);
        setLoading(false);
      });
      
    return () => { mounted = false };
  }, [therapistId, date]);

  return { slots, loading, error };
}

