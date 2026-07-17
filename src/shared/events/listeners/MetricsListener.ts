/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/shared/logger';

export function registerMetricsListeners(eventBus: any) {
  function getTodayDateStr(): string {
    // Return date in YYYY-MM-DD format
    return new Date().toISOString().split('T')[0];
  }

  function getMillis(val: any): number {
    if (!val) return 0;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    const t = new Date(val);
    return isNaN(t.getTime()) ? 0 : t.getTime();
  }

  async function updateMetricCounter(field: string, incrementValue: number = 1) {
    if (!adminDb) return;
    try {
      const dateStr = getTodayDateStr();
      const docRef = adminDb.collection('daily_metrics').doc(dateStr);
      await docRef.set({
        date: dateStr,
        [field]: FieldValue.increment(incrementValue),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      logger.error(`[MetricsListener] Failed to update metric ${field}`, { error: err });
    }
  }

  async function updateMetricLatency(totalField: string, countField: string, latencyMs: number) {
    if (!adminDb || latencyMs <= 0) return;
    try {
      const dateStr = getTodayDateStr();
      const docRef = adminDb.collection('daily_metrics').doc(dateStr);
      await docRef.set({
        date: dateStr,
        [totalField]: FieldValue.increment(latencyMs),
        [countField]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      logger.error(`[MetricsListener] Failed to update latency metrics`, { error: err });
    }
  }

  // 1. Booking Counters
  eventBus.subscribe('BookingSlotLocked', async () => {
    await updateMetricCounter('bookingsCreated', 1);
  });

  eventBus.subscribe('BookingConfirmed', async (event: any) => {
    await updateMetricCounter('bookingsConfirmed', 1);
    
    // Compute booking confirmation latency
    const { booking } = event.payload;
    if (booking) {
      const createdAtMillis = getMillis(booking.createdAt);
      if (createdAtMillis > 0) {
        const latency = Date.now() - createdAtMillis;
        await updateMetricLatency('totalBookingLatencyMs', 'bookingLatencyCount', latency);
      }
    }
  });

  eventBus.subscribe('BookingCancelled', async () => {
    await updateMetricCounter('bookingsCancelled', 1);
  });

  eventBus.subscribe('BookingRejected', async () => {
    await updateMetricCounter('bookingsCancelled', 1); // Grouping declined/cancelled under cancelled for basic operational health
  });

  // 2. Payment Counters
  eventBus.subscribe('PaymentSuccess', async () => {
    await updateMetricCounter('paymentsSucceeded', 1);
  });

  eventBus.subscribe('PaymentFailed', async () => {
    await updateMetricCounter('paymentsFailed', 1);
  });

  // 3. Email Counters
  eventBus.subscribe('EmailEnqueued', async () => {
    await updateMetricCounter('emailsQueued', 1);
  });

  eventBus.subscribe('EmailSent', async () => {
    await updateMetricCounter('emailsSent', 1);
  });

  eventBus.subscribe('EmailFailed', async () => {
    await updateMetricCounter('emailsFailed', 1);
  });
}
