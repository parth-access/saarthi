import { db } from '../../api/firebase-admin.js';
import { AppError } from '../utils/error.js';
import { analyticsService } from './analytics.service.js';

export const availabilityService = {
  async getAvailability(therapistId: string, date: string) {
    // 1. Get rules for the therapist
    const dayOfWeek = new Date(date).getDay();
    const rulesSnapshot = await db.collection('availability_rules')
      .where('therapistId', '==', therapistId)
      .where('dayOfWeek', '==', dayOfWeek)
      .get();

    if (rulesSnapshot.empty) return [];

    // 2. Generate slots from rules
    const slots: any[] = [];
    rulesSnapshot.forEach(doc => {
      const rule = doc.data();
      const start = rule.startTime; // HH:mm
      const end = rule.endTime;
      const duration = rule.slotDuration || 60;

      let current = start;
      while (current < end) {
        slots.push({
          time: current,
          isAvailable: true,
          reason: null
        });
        
        // Simple time increment (assuming HH:mm format)
        let [h, m] = current.split(':').map(Number);
        m += duration;
        h += Math.floor(m / 60);
        m %= 60;
        current = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      }
    });

    // 3. Filter by existing bookings
    const bookingsSnapshot = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    const bookedTimes = new Set();
    bookingsSnapshot.forEach(doc => bookedTimes.add(doc.data().time));

    // 4. Filter by active locks
    const locksSnapshot = await db.collection('locks')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('expiresAt', '>', new Date())
      .get();

    const lockedTimes = new Set();
    locksSnapshot.forEach(doc => lockedTimes.add(doc.data().time));

    return slots.map(slot => {
      if (bookedTimes.has(slot.time)) {
        return { ...slot, isAvailable: false, reason: 'booked' };
      }
      if (lockedTimes.has(slot.time)) {
        return { ...slot, isAvailable: false, reason: 'locked' };
      }
      return slot;
    });
  },

  async lockSlot(therapistId: string, date: string, time: string, meta: { requestId?: string } = {}) {
    // Basic validation before locking
    const existing = await db.collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('time', '==', time)
      .where('status', 'in', ['confirmed', 'pending'])
      .get();

    if (!existing.empty) {
      throw new AppError('This slot was just booked by someone else.', 409);
    }

    const lockRef = db.collection('locks').doc();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 min lock

    await lockRef.set({
      therapistId,
      date,
      time,
      expiresAt,
      createdAt: new Date(),
      requestId: meta.requestId
    });

    // Track analytics
    await analyticsService.trackEvent('slot_lock', { 
      requestId: meta.requestId, 
      metadata: { therapistId, date, time } 
    });

    return { lockId: lockRef.id };
  }
};
