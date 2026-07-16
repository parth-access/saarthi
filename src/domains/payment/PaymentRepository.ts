import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export class PaymentRepository {
  static async logWebhookEvent(eventId: string, payload: unknown, signature: string) {
    if (!adminDb) return;
    const ref = adminDb.collection('webhook_events').doc(eventId);
    await ref.set({
      id: eventId,
      signature,
      receivedAt: FieldValue.serverTimestamp(),
      status: 'pending',
      rawPayload: JSON.stringify(payload)
    });
  }

  static async markWebhookProcessed(eventId: string) {
    if (!adminDb) return;
    const ref = adminDb.collection('webhook_events').doc(eventId);
    await ref.update({
      status: 'processed',
      processedAt: FieldValue.serverTimestamp()
    });
  }
}
