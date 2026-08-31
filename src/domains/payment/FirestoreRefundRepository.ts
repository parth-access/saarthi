import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Transaction, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { RefundRepository, RefundRequest } from './RefundRepository';

const COLLECTION = 'refunds';

function toEntity(doc: DocumentSnapshot | QueryDocumentSnapshot): RefundRequest {
  const data = doc.data() || {};
  return {
    id: doc.id,
    bookingId: data.bookingId,
    razorpayPaymentId: data.razorpayPaymentId,
    razorpayOrderId: data.razorpayOrderId,
    refundPercent: data.refundPercent,
    reason: data.reason,
    status: data.status,
    attempts: data.attempts ?? 0,
    refundId: data.refundId,
    amountRefundedPaise: data.amountRefundedPaise,
    error: data.error,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export class FirestoreRefundRepository implements RefundRepository {
  refundIdForPayment(razorpayPaymentId: string): string {
    return `refund_${razorpayPaymentId}`;
  }

  async enqueue(
    request: Omit<RefundRequest, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>,
    transaction?: Transaction
  ): Promise<boolean> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const ref = adminDb.collection(COLLECTION).doc(request.id);

    const payload = {
      bookingId: request.bookingId,
      razorpayPaymentId: request.razorpayPaymentId,
      razorpayOrderId: request.razorpayOrderId ?? null,
      refundPercent: request.refundPercent,
      reason: request.reason,
      status: 'PENDING' as const,
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Create-guard: never overwrite an existing refund request for this payment.
    const write = (doc: DocumentSnapshot, t?: Transaction): boolean => {
      if (doc.exists) return false;
      if (t) {
        t.set(ref, payload);
      }
      return true;
    };

    if (transaction) {
      const doc = await transaction.get(ref);
      return write(doc, transaction);
    }
    return adminDb.runTransaction(async (t) => {
      const doc = await t.get(ref);
      return write(doc, t);
    });
  }

  async findById(id: string): Promise<RefundRequest | null> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const doc = await adminDb.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return toEntity(doc);
  }

  async save(request: RefundRequest): Promise<void> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const { id, ...rest } = request;
    const data: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) data[k] = v;
    }
    await adminDb.collection(COLLECTION).doc(id).set(data, { merge: true });
  }

  async findRefundsNeedingProcessing(limitCount: number = 25): Promise<RefundRequest[]> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const snapshot = await adminDb.collection(COLLECTION)
      .where('status', 'in', ['PENDING', 'FAILED'])
      .limit(limitCount)
      .get();
    return snapshot.docs.map(toEntity);
  }

  async findByPaymentId(razorpayPaymentId: string): Promise<RefundRequest | null> {
    return this.findById(this.refundIdForPayment(razorpayPaymentId));
  }
}

export const firestoreRefundRepository = new FirestoreRefundRepository();
