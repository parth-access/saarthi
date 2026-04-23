import { db } from '../../api/firebase-admin.js';
import { logger } from '../logger.js';

export type EventType = 'booking_request' | 'slot_lock' | 'booking_confirm' | 'booking_reject' | 'step_reached';

interface AnalyticsEvent {
  type: EventType;
  step?: number;
  metadata?: any;
  timestamp: Date;
  requestId?: string;
  userId?: string;
}

export const analyticsService = {
  async trackEvent(type: EventType, data: { step?: number; metadata?: any; requestId?: string; userId?: string } = {}) {
    try {
      const event: AnalyticsEvent = {
        type,
        ...data,
        timestamp: new Date(),
      };

      // In production, you might pipe this to BigQuery or Mixpanel
      // For now, we use a dedicated Firestore collection for easy querying
      await db.collection('analytics_events').add(event);
      
      logger.info('Analytics event tracked', { type, step: data.step });
    } catch (err) {
      // Don't crash the request if analytics fails
      logger.error('Failed to track analytics event', { type }, err);
    }
  },

  async getDailyStats(date: string) {
    // Helper for admin dashboard
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const snapshot = await db.collection('analytics_events')
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .get();

    return snapshot.docs.map(doc => doc.data());
  }
};
