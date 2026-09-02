import { adminDb } from '@/lib/firebase/admin';
import { DocumentReference, FieldValue, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { TxReader, TxWriter } from '@/shared/firestore/transactionPhases';
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

export interface RefundEnqueuePlan {
  ref: DocumentReference;
  payload: Record<string, unknown>;
  /** False when a refund request for this payment already exists. */
  shouldCreate: boolean;
}

export class FirestoreRefundRepository implements RefundRepository {
  refundIdForPayment(razorpayPaymentId: string): string {
    return `refund_${razorpayPaymentId}`;
  }

  private buildEnqueuePayload(
    request: Omit<RefundRequest, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>
  ): Record<string, unknown> {
    return {
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
  }

  /**
   * READ PHASE — resolves the create-guard for an enqueue without writing.
   * Pair with {@link applyEnqueue} when enqueuing inside a caller's transaction,
   * so the guard read happens before that transaction's writes.
   */
  async readEnqueuePlan(
    request: Omit<RefundRequest, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>,
    reader: TxReader
  ): Promise<RefundEnqueuePlan> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    const ref = adminDb.collection(COLLECTION).doc(request.id);
    const doc = await reader.get(ref);
    return { ref, payload: this.buildEnqueuePayload(request), shouldCreate: !doc.exists };
  }

  /**
   * WRITE PHASE — applies a {@link RefundEnqueuePlan}. Never overwrites an
   * existing refund request, which is what makes double-cancel idempotent.
   */
  applyEnqueue(writer: TxWriter, plan: RefundEnqueuePlan): boolean {
    if (!plan.shouldCreate) return false;
    writer.set(plan.ref, plan.payload);
    return true;
  }

  /**
   * Enqueues a refund in its own transaction. For enqueuing inside an existing
   * transaction use {@link readEnqueuePlan} + {@link applyEnqueue} instead — a
   * combined read+write helper cannot guarantee the caller's phase ordering.
   */
  async enqueue(
    request: Omit<RefundRequest, 'status' | 'attempts' | 'createdAt' | 'updatedAt'>
  ): Promise<boolean> {
    if (!adminDb) throw new Error('Firestore adminDb is not initialized.');
    return adminDb.runTransaction(async (t) => {
      const plan = await this.readEnqueuePlan(request, t);
      return this.applyEnqueue(t, plan);
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
