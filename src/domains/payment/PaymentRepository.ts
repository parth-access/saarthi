import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Transaction, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Payment } from './Payment';

export class PaymentMapper {
  static toEntity(doc: DocumentSnapshot | QueryDocumentSnapshot): Payment {
    const data = doc.data();
    if (!data) {
      throw new Error(`Document ${doc.id} has no data`);
    }
    return new Payment({
      id: doc.id,
      ...data,
    });
  }

  static toPersistence(payment: Partial<Payment>): Record<string, unknown> {
    return { ...payment } as Record<string, unknown>;
  }
}

export class PaymentRepository {
  async save(payment: Payment, transaction?: Transaction): Promise<void> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const docRef = adminDb.collection('payments').doc(payment.id);
    const data = {
      ...PaymentMapper.toPersistence(payment),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (transaction) {
      transaction.set(docRef, data, { merge: true });
    } else {
      await docRef.set(data, { merge: true });
    }
  }

  async findById(paymentId: string, transaction?: Transaction): Promise<Payment | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const docRef = adminDb.collection('payments').doc(paymentId);
    const doc = transaction ? await transaction.get(docRef) : await docRef.get();
    if (!doc.exists) return null;
    return PaymentMapper.toEntity(doc);
  }

  async findByOrderId(orderId: string, transaction?: Transaction): Promise<Payment | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const query = adminDb.collection('payments').where('razorpayOrderId', '==', orderId).limit(1);
    const snapshot = transaction ? await transaction.get(query) : await query.get();
    if (!snapshot || snapshot.empty || !snapshot.docs || snapshot.docs.length === 0) return null;
    return PaymentMapper.toEntity(snapshot.docs[0]);
  }

  async findByBookingId(bookingId: string, transaction?: Transaction): Promise<Payment | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const query = adminDb.collection('payments').where('bookingId', '==', bookingId).limit(1);
    const snapshot = transaction ? await transaction.get(query) : await query.get();
    if (!snapshot || snapshot.empty || !snapshot.docs || snapshot.docs.length === 0) return null;
    return PaymentMapper.toEntity(snapshot.docs[0]);
  }

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

export const firestorePaymentRepository = new PaymentRepository();
