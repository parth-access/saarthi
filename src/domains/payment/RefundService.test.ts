import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefundService, RefundGateway } from './RefundService';
import { RefundRepository, RefundRequest } from './RefundRepository';
import { PaymentRefundState, RefundResult } from './PaymentGateway';

// In-memory refund repository so we can assert exactly what was persisted.
function makeRepo(seed?: RefundRequest): { repo: RefundRepository; store: Map<string, RefundRequest> } {
  const store = new Map<string, RefundRequest>();
  if (seed) store.set(seed.id, seed);
  const repo: RefundRepository = {
    refundIdForPayment: (p) => `refund_${p}`,
    enqueue: async () => true,
    findById: async (id) => store.get(id) ?? null,
    save: async (r) => {
      const prev = store.get(r.id) ?? ({} as RefundRequest);
      store.set(r.id, { ...prev, ...r });
    },
    findRefundsNeedingProcessing: async () => [],
    findByPaymentId: async (p) => store.get(`refund_${p}`) ?? null,
  };
  return { repo, store };
}

// Fake Firestore capturing booking updates + audit writes.
function makeDb() {
  const bookingUpdate = vi.fn().mockResolvedValue(undefined);
  const auditAdd = vi.fn().mockResolvedValue(undefined);
  const db = {
    collection: (name: string) => {
      if (name === 'audit_logs') return { add: auditAdd, doc: () => ({ update: vi.fn() }) };
      return { doc: () => ({ update: bookingUpdate }) };
    },
  };
  return { db, bookingUpdate, auditAdd };
}

function seedRefund(overrides: Partial<RefundRequest> = {}): RefundRequest {
  return {
    id: 'refund_pay_1',
    bookingId: 'bk_1',
    razorpayPaymentId: 'pay_1',
    razorpayOrderId: 'order_1',
    refundPercent: 100,
    reason: 'double_booking',
    status: 'PENDING',
    attempts: 0,
    ...overrides,
  };
}

function makeGateway(state: PaymentRefundState | null, refundResult?: RefundResult): {
  gateway: RefundGateway;
  fetch: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
} {
  const fetch = vi.fn().mockResolvedValue(state);
  const refund = vi.fn().mockResolvedValue(refundResult ?? { id: 'rfnd_1', status: 'processed', amount: 0 });
  return { gateway: { fetchPaymentRefundState: fetch, refundPayment: refund }, fetch, refund };
}

const captured = (amountPaise: number, amountRefundedPaise = 0, refundStatus = 'null'): PaymentRefundState => ({
  status: 'captured',
  amountPaise,
  amountRefundedPaise,
  refundStatus,
});

describe('RefundService.processRefund', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fully refunds a double-booking capture (100%) and marks the booking refunded', async () => {
    const { repo, store } = makeRepo(seedRefund({ refundPercent: 100 }));
    const { gateway, refund } = makeGateway(captured(150000), { id: 'rfnd_9', status: 'processed', amount: 150000 });
    const { db, bookingUpdate, auditAdd } = makeDb();

    const svc = new RefundService(repo, gateway, db as never);
    const res = await svc.processRefund('refund_pay_1');

    expect(res).toMatchObject({ success: true, outcome: 'PROCESSED', refundId: 'rfnd_9', amountRefundedPaise: 150000 });
    expect(refund).toHaveBeenCalledWith('pay_1', 150000, expect.objectContaining({ bookingId: 'bk_1', reason: 'double_booking' }), 'refund_pay_1');
    expect(store.get('refund_pay_1')?.status).toBe('PROCESSED');
    expect(store.get('refund_pay_1')?.refundId).toBe('rfnd_9');
    expect(bookingUpdate).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: 'refunded', refundId: 'rfnd_9' }));
    expect(auditAdd).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'REFUND_PROCESSED' }));
  });

  it('refunds 50% of the captured amount for a cancellation (floored)', async () => {
    const { repo } = makeRepo(seedRefund({ refundPercent: 50, reason: 'cancellation' }));
    const { gateway, refund } = makeGateway(captured(99999), { id: 'rfnd_5', status: 'processed', amount: 49999 });
    const { db } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');

    expect(refund).toHaveBeenCalledWith('pay_1', 49999, expect.anything(), 'refund_pay_1'); // floor(99999*50/100)
    expect(res.outcome).toBe('PROCESSED');
  });

  it('reconciles (no second refund) when Razorpay already reports a full refund', async () => {
    const { repo, store } = makeRepo(seedRefund({ refundPercent: 100 }));
    const { gateway, refund } = makeGateway({ status: 'refunded', amountPaise: 150000, amountRefundedPaise: 150000, refundStatus: 'full' });
    const { db, bookingUpdate } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');

    expect(refund).not.toHaveBeenCalled();
    expect(res.outcome).toBe('RECONCILED');
    expect(store.get('refund_pay_1')?.status).toBe('PROCESSED');
    expect(bookingUpdate).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: 'refunded' }));
  });

  it('reconciles when amount_refunded already covers the requested amount', async () => {
    const { repo } = makeRepo(seedRefund({ refundPercent: 100 }));
    const { gateway, refund } = makeGateway(captured(150000, 150000, 'partial')); // enough refunded already
    const { db } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');

    expect(refund).not.toHaveBeenCalled();
    expect(res.outcome).toBe('RECONCILED');
  });

  it('fails (retryable) and does NOT refund/mark-booking when the payment is not captured', async () => {
    const { repo, store } = makeRepo(seedRefund());
    const { gateway, refund } = makeGateway({ status: 'authorized', amountPaise: 150000, amountRefundedPaise: 0, refundStatus: 'null' });
    const { db, bookingUpdate, auditAdd } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');

    expect(refund).not.toHaveBeenCalled();
    expect(res.success).toBe(false);
    expect(res.outcome).toBe('FAILED');
    expect(store.get('refund_pay_1')?.status).toBe('FAILED');
    expect(store.get('refund_pay_1')?.attempts).toBe(1);
    expect(bookingUpdate).not.toHaveBeenCalled();
    expect(auditAdd).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'REFUND_FAILED' }));
  });

  it('marks FAILED (retryable) and never marks booking refunded when the gateway refund throws', async () => {
    const { repo, store } = makeRepo(seedRefund({ attempts: 1 }));
    const { gateway } = makeGateway(captured(150000));
    gateway.refundPayment = vi.fn().mockRejectedValue(new Error('gateway down'));
    const { db, bookingUpdate } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');

    expect(res.outcome).toBe('FAILED');
    expect(store.get('refund_pay_1')?.status).toBe('FAILED');
    expect(store.get('refund_pay_1')?.attempts).toBe(2); // incremented
    expect(store.get('refund_pay_1')?.error).toContain('gateway down');
    expect(bookingUpdate).not.toHaveBeenCalled();
  });

  it('marks FAILED (retryable) when fetching the payment state throws', async () => {
    const { repo, store } = makeRepo(seedRefund());
    const { gateway } = makeGateway(null);
    gateway.fetchPaymentRefundState = vi.fn().mockRejectedValue(new Error('fetch 500'));
    const { db } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');
    expect(res.outcome).toBe('FAILED');
    expect(store.get('refund_pay_1')?.status).toBe('FAILED');
  });

  it('is a no-op for an already-PROCESSED refund (no gateway calls)', async () => {
    const { repo } = makeRepo(seedRefund({ status: 'PROCESSED', refundId: 'rfnd_done', amountRefundedPaise: 150000 }));
    const { gateway, fetch, refund } = makeGateway(captured(150000));
    const { db, bookingUpdate } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_pay_1');

    expect(res).toMatchObject({ success: true, outcome: 'SKIPPED', refundId: 'rfnd_done' });
    expect(fetch).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
    expect(bookingUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the refund doc does not exist', async () => {
    const { repo } = makeRepo();
    const { gateway } = makeGateway(captured(150000));
    const { db } = makeDb();

    const res = await new RefundService(repo, gateway, db as never).processRefund('refund_missing');
    expect(res).toMatchObject({ success: false, outcome: 'NOT_FOUND' });
  });
});
