import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReceiptService, ownsBookingForReceipt } from './ReceiptService';
import { Booking } from '@/domains/booking/entities/Booking';
import { Payment } from '@/domains/payment/Payment';

/**
 * The authorization matrix for receipts.
 *
 * The brief was explicit: "A user must not be able to change an ID in the URL and
 * retrieve somebody else's receipt." These tests are that sentence, executable.
 *
 * Two properties are worth breaking a build over. First, `getForClient` returns
 * `null` for "no such booking", "not yours" and "not paid for" alike, so the route
 * answers 404 to all three and the id space cannot be enumerated. Second, there is
 * no staff bypass: a therapist's own uid on their own client's booking is still a
 * stranger here, because this is the endpoint a browser calls.
 */

const h = vi.hoisted(() => ({
  state: {
    therapists: {} as Record<string, { name?: string } | undefined>,
    /** One entry per `adminDb.getAll` call, holding the ids it was asked for. */
    getAllCalls: [] as string[][],
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ id, path: `${name}/${id}` }),
    }),
    getAll: async (...refs: { id: string }[]) => {
      h.state.getAllCalls.push(refs.map((r) => r.id));
      return refs.map((ref) => {
        const data = h.state.therapists[ref.id];
        return { id: ref.id, exists: !!data, data: () => data };
      });
    },
  },
}));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/domains/booking/repository/FirestoreBookingRepository')>();
  return {
    ...actual,
    firestoreBookingRepository: {
      findById: vi.fn(),
      findByClient: vi.fn(),
    },
  };
});

vi.mock('@/domains/payment/PaymentRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domains/payment/PaymentRepository')>();
  return {
    ...actual,
    firestorePaymentRepository: { findByBookingId: vi.fn() },
  };
});

const { firestoreBookingRepository } = await import(
  '@/domains/booking/repository/FirestoreBookingRepository'
);
const { firestorePaymentRepository } = await import('@/domains/payment/PaymentRepository');

const OWNER = { uid: 'uid_ananya', email: 'ananya@example.com' };
const STRANGER = { uid: 'uid_rahul', email: 'rahul@example.com' };

function booking(overrides: Partial<Booking> = {}): Booking {
  return new Booking({
    id: 'bk_20260902_ABCD1234',
    therapistId: 'th_priya',
    userId: 'uid_ananya',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    phone: '9876543210',
    date: '2026-09-10',
    time: '09:00',
    sessionType: 'Individual therapy',
    sessionMode: 'online',
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentAmount: 1500,
    paymentCurrency: 'INR',
    razorpayOrderId: 'order_ABC123',
    razorpayPaymentId: 'pay_XYZ789',
    paymentVerifiedAt: new Date('2026-09-01T10:15:00.000Z'),
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    ...overrides,
  });
}

let service: ReceiptService;

beforeEach(() => {
  vi.clearAllMocks();
  h.state.therapists = { th_priya: { name: 'Dr Priya Menon' } };
  h.state.getAllCalls = [];
  vi.mocked(firestorePaymentRepository.findByBookingId).mockResolvedValue(null);
  service = new ReceiptService();
});

describe('ownsBookingForReceipt', () => {
  it('accepts the verified uid on the booking', () => {
    expect(ownsBookingForReceipt(booking(), OWNER)).toBe(true);
    expect(ownsBookingForReceipt(booking(), { uid: 'uid_ananya' })).toBe(true);
  });

  it('accepts the legacy form where the email was stored as the uid', () => {
    // Older guest bookings recorded the email in `userId`.
    const legacy = booking({ userId: 'ananya@example.com' });
    expect(ownsBookingForReceipt(legacy, { uid: 'ananya@example.com' })).toBe(true);
  });

  it('matches the session email case-insensitively', () => {
    // A guest booking stores only the email; the same person may later sign in
    // with it, and providers do not preserve the case they were given.
    const guest = booking({ userId: undefined, email: 'Ananya@Example.COM' });
    expect(ownsBookingForReceipt(guest, { uid: 'uid_someone_else', email: 'ananya@example.com' })).toBe(
      true
    );
    expect(ownsBookingForReceipt(booking({ userId: undefined }), { uid: '', email: 'ANANYA@EXAMPLE.COM' })).toBe(
      true
    );
  });

  it('rejects a different person', () => {
    expect(ownsBookingForReceipt(booking(), STRANGER)).toBe(false);
  });

  it('rejects the therapist who ran the session', () => {
    // The concrete "staff bypass" case. Support re-sending a receipt belongs in an
    // audited admin endpoint, not in the route a client's browser calls.
    expect(ownsBookingForReceipt(booking(), { uid: 'th_priya' })).toBe(false);
    expect(ownsBookingForReceipt(booking(), { uid: 'admin', email: 'admin@saarthilife.com' })).toBe(
      false
    );
  });

  it('rejects an identity with nothing in it', () => {
    expect(ownsBookingForReceipt(booking(), { uid: '' })).toBe(false);
    expect(ownsBookingForReceipt(booking(), { uid: '   ', email: '  ' })).toBe(false);
    expect(ownsBookingForReceipt(booking(), {} as { uid: string })).toBe(false);
  });

  it('never lets two absent values match each other', () => {
    // Without the truthiness guards, `undefined === undefined` on a booking with no
    // `userId` and a session with no uid would hand a stranger the receipt.
    const anonymous = booking({ userId: undefined, email: undefined });
    expect(ownsBookingForReceipt(anonymous, { uid: undefined as unknown as string })).toBe(false);
    expect(ownsBookingForReceipt(anonymous, { uid: '', email: undefined })).toBe(false);
    expect(ownsBookingForReceipt(booking({ email: undefined }), { uid: 'x', email: undefined })).toBe(
      false
    );
    expect(ownsBookingForReceipt(booking({ userId: undefined, email: '' }), { uid: 'x', email: '' })).toBe(
      false
    );
  });

  it('rejects a session with no uid against a booking with no userId', () => {
    // The live form of the bug above, and the one the empty-identity test cannot
    // reach: the session carries an email (so the early return does not fire) but
    // no uid, and the booking carries an email that is not this person's and no
    // `userId` at all. Compare `booking.userId === uid` without the `!!uid` guard
    // and `undefined === undefined` is true — a stranger gets the receipt.
    const guestOfSomeoneElse = booking({ userId: undefined, email: 'ananya@example.com' });
    expect(
      ownsBookingForReceipt(guestOfSomeoneElse, {
        uid: undefined as unknown as string,
        email: 'rahul@example.com',
      })
    ).toBe(false);
    expect(ownsBookingForReceipt(guestOfSomeoneElse, { uid: '', email: 'rahul@example.com' })).toBe(
      false
    );
  });
});

describe('ReceiptService.getForClient', () => {
  it('returns the receipt to its owner', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    const receipt = await service.getForClient(OWNER, 'bk_20260902_ABCD1234');
    expect(receipt).not.toBeNull();
    expect(receipt!.bookingId).toBe('bk_20260902_ABCD1234');
    expect(receipt!.therapistName).toBe('Dr Priya Menon');
    expect(receipt!.amount).toBe(1500);
  });

  it('returns null when the booking belongs to somebody else', async () => {
    // Changing the id in the URL to a real, paid booking id.
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    expect(await service.getForClient(STRANGER, 'bk_20260902_ABCD1234')).toBeNull();
  });

  it('returns null for a booking that does not exist', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null);
    expect(await service.getForClient(OWNER, 'bk_does_not_exist')).toBeNull();
  });

  it('returns null for the owner’s own unpaid booking, without reading anything further', async () => {
    for (const paymentStatus of ['unpaid', 'pending', 'initiated', 'failed'] as const) {
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking({ paymentStatus }));
      expect(await service.getForClient(OWNER, 'bk_20260902_ABCD1234')).toBeNull();
    }
    // The receiptable gate sits before the supplementary reads, so a booking that
    // can never have a receipt costs one read rather than three.
    expect(firestorePaymentRepository.findByBookingId).not.toHaveBeenCalled();
    expect(h.state.getAllCalls).toHaveLength(0);
  });

  it('is indistinguishable across not-found, not-yours and not-paid', async () => {
    // All three are `null`, so the route answers 404 to each and the id space
    // cannot be probed for which bookings exist or which have been paid.
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(null);
    const missing = await service.getForClient(OWNER, 'bk_1');
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(booking());
    const foreign = await service.getForClient(STRANGER, 'bk_1');
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValueOnce(
      booking({ paymentStatus: 'failed' })
    );
    const unpaid = await service.getForClient(OWNER, 'bk_1');
    expect([missing, foreign, unpaid]).toEqual([null, null, null]);
  });

  it('reads nothing at all for a blank booking id', async () => {
    expect(await service.getForClient(OWNER, '')).toBeNull();
    expect(await service.getForClient(OWNER, '   ')).toBeNull();
    expect(await service.getForClient(OWNER, undefined as unknown as string)).toBeNull();
    expect(firestoreBookingRepository.findById).not.toHaveBeenCalled();
  });

  it('does not consult the payments collection until ownership has passed', async () => {
    // Ordering matters: a rejected caller must not be able to make the server do
    // work on a record they have no claim to.
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    await service.getForClient(STRANGER, 'bk_20260902_ABCD1234');
    expect(firestorePaymentRepository.findByBookingId).not.toHaveBeenCalled();
    expect(h.state.getAllCalls).toHaveLength(0);
  });

  it('supplements the booking with the gateway payment record', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(
      booking({ razorpayPaymentId: undefined, razorpayOrderId: undefined })
    );
    vi.mocked(firestorePaymentRepository.findByBookingId).mockResolvedValue(
      new Payment({
        id: 'order_ABC123',
        bookingId: 'bk_20260902_ABCD1234',
        razorpayOrderId: 'order_ABC123',
        razorpayPaymentId: 'pay_XYZ789',
        amount: 1500,
        currency: 'INR',
        status: 'success',
      })
    );
    const receipt = await service.getForClient(OWNER, 'bk_20260902_ABCD1234');
    expect(receipt!.razorpayPaymentId).toBe('pay_XYZ789');
    expect(receipt!.razorpayOrderId).toBe('order_ABC123');
  });

  it('still issues the receipt when the payments read fails', async () => {
    // The booking is the source of truth; a missing or unreadable gateway document
    // must not deny a client the receipt for money that was captured.
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    vi.mocked(firestorePaymentRepository.findByBookingId).mockRejectedValue(
      new Error('Firestore unavailable')
    );
    const receipt = await service.getForClient(OWNER, 'bk_20260902_ABCD1234');
    expect(receipt).not.toBeNull();
    expect(receipt!.razorpayPaymentId).toBe('pay_XYZ789');
  });

  it('labels a therapist whose document has been deleted, rather than printing an id', async () => {
    h.state.therapists = {};
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
    const receipt = await service.getForClient(OWNER, 'bk_20260902_ABCD1234');
    expect(receipt!.therapistName).toBe('Saarthi therapist');
    expect(receipt!.therapistName).not.toContain('th_priya');
  });
});

describe('ReceiptService.listForClient', () => {
  it('lists only the sessions whose money was captured', async () => {
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([
      booking({ id: 'bk_paid', paymentStatus: 'paid' }),
      booking({ id: 'bk_refunded', paymentStatus: 'refunded' }),
      booking({ id: 'bk_success', paymentStatus: 'success' }),
      booking({ id: 'bk_unpaid', paymentStatus: 'unpaid' }),
      booking({ id: 'bk_failed', paymentStatus: 'failed' }),
      booking({ id: 'bk_pending', paymentStatus: 'pending' }),
    ]);
    const ids = (await service.listForClient(OWNER)).map((r) => r.bookingId);
    expect(ids.sort()).toEqual(['bk_paid', 'bk_refunded', 'bk_success']);
  });

  it('queries by the verified identity, never by anything the client sent', async () => {
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([]);
    await service.listForClient(OWNER);
    expect(firestoreBookingRepository.findByClient).toHaveBeenCalledWith({
      uid: 'uid_ananya',
      email: 'ananya@example.com',
    });
  });

  it('re-applies ownership to whatever the query returned', async () => {
    // Defence in depth. If a future index or query change ever widened the result
    // set, the predicate still drops anything that is not this client's.
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([
      booking({ id: 'bk_mine' }),
      booking({ id: 'bk_someone_else', userId: 'uid_rahul', email: 'rahul@example.com' }),
    ]);
    const receipts = await service.listForClient(OWNER);
    expect(receipts.map((r) => r.bookingId)).toEqual(['bk_mine']);
  });

  it('returns nothing for an identity with no uid and no email', async () => {
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([booking()]);
    expect(await service.listForClient({ uid: '' })).toEqual([]);
  });

  it('orders newest payment first', async () => {
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([
      booking({ id: 'bk_older', paymentVerifiedAt: new Date('2026-08-01T10:00:00.000Z') }),
      booking({ id: 'bk_newest', paymentVerifiedAt: new Date('2026-09-01T10:00:00.000Z') }),
      booking({ id: 'bk_middle', paymentVerifiedAt: new Date('2026-08-20T10:00:00.000Z') }),
    ]);
    expect((await service.listForClient(OWNER)).map((r) => r.bookingId)).toEqual([
      'bk_newest',
      'bk_middle',
      'bk_older',
    ]);
  });

  it('resolves therapist names in a single de-duplicated round trip', async () => {
    // Twenty sessions with one therapist must cost one read, not twenty.
    h.state.therapists = { th_priya: { name: 'Dr Priya Menon' }, th_arjun: { name: 'Dr Arjun Rao' } };
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([
      booking({ id: 'bk_1', therapistId: 'th_priya' }),
      booking({ id: 'bk_2', therapistId: 'th_priya' }),
      booking({ id: 'bk_3', therapistId: 'th_arjun' }),
    ]);
    const receipts = await service.listForClient(OWNER);
    expect(h.state.getAllCalls).toHaveLength(1);
    expect([...h.state.getAllCalls[0]].sort()).toEqual(['th_arjun', 'th_priya']);
    expect(receipts.map((r) => r.therapistName).sort()).toEqual([
      'Dr Arjun Rao',
      'Dr Priya Menon',
      'Dr Priya Menon',
    ]);
  });

  it('does not read the payments collection once per row', async () => {
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([
      booking({ id: 'bk_1' }),
      booking({ id: 'bk_2' }),
    ]);
    await service.listForClient(OWNER);
    expect(firestorePaymentRepository.findByBookingId).not.toHaveBeenCalled();
  });

  it('returns an empty list rather than throwing when the client has no bookings', async () => {
    vi.mocked(firestoreBookingRepository.findByClient).mockResolvedValue([]);
    expect(await service.listForClient(OWNER)).toEqual([]);
    expect(h.state.getAllCalls).toHaveLength(0);
  });
});
