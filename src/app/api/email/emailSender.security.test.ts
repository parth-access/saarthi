import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Security contract of sendEmailAction (post-P1-2 remediation):
 *   - the booking is resolved from Firestore; a missing or unverifiable booking
 *     is a hard error — there is NO caller-supplied fallback to send from;
 *   - recipient, therapist and content derive from the stored booking, so a
 *     tampered payload cannot redirect mail;
 *   - dispatch stays idempotent per booking+type (duplicate requests converge).
 */

vi.mock('@/lib/firebase/admin', () => {
  const mocks = {
    emailsGet: vi.fn(),
    emailsSet: vi.fn().mockResolvedValue(undefined),
    emailsUpdate: vi.fn().mockResolvedValue(undefined),
    therapistDocId: vi.fn(),
  };
  return {
    __mocks: mocks,
    adminDb: {
      collection: vi.fn((name: string) => {
        if (name === 'emails') {
          return { doc: vi.fn(() => ({ get: mocks.emailsGet, set: mocks.emailsSet, update: mocks.emailsUpdate })) };
        }
        if (name === 'therapists') {
          return {
            doc: vi.fn((id: string) => {
              mocks.therapistDocId(id);
              return { get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'Dr Priya', email: 'priya@saarthi.com' }) }) };
            }),
          };
        }
        throw new Error(`unexpected collection ${name}`);
      }),
    },
  };
});

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: { findById: vi.fn(), save: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/shared/events/EventBus', () => ({
  EventBus: { publish: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/server/pdf/renderReceiptPdf', () => ({
  renderReceiptPdf: vi.fn().mockReturnValue(Buffer.from('pdf')),
  receiptFileName: vi.fn().mockReturnValue('receipt.pdf'),
}));

vi.mock('@/domains/payment/Receipt', () => ({
  buildReceipt: vi.fn().mockReturnValue(null),
}));

vi.mock('../_lib/resendClient', () => ({
  getResendClient: vi.fn(() => ({ emails: { send: sendMock } })),
}));

import { sendEmailAction } from './emailSender';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';

const sendMock = vi.fn().mockResolvedValue({ data: { id: 're_1' }, error: null });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminMocked: any = await import('@/lib/firebase/admin');

function bookingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk_1',
    status: 'confirmed',
    paymentStatus: 'paid',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    phone: '+91 98765 43210',
    therapistId: 'th_priya',
    date: '2026-10-10',
    time: '10:00',
    bookingToken: 'a'.repeat(72),
    ...overrides,
  };
}

function confirmedPayload() {
  return { type: 'booking-confirmed' as const, bookingId: 'bk_1', therapistId: 'th_priya' };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue({ data: { id: 're_1' }, error: null });
  adminMocked.__mocks.emailsGet.mockResolvedValue({ exists: false });
  process.env.RESEND_API_KEY = 're_test_key';
  vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(bookingFixture() as never);
});

describe('sendEmailAction — booking resolution', () => {
  it('refuses to send when the booking does not exist (no fallback path)', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null as never);

    await expect(sendEmailAction(confirmedPayload())).rejects.toThrow(/transactional email refused/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('refuses to send when the booking lookup fails (DB error is not a fallback trigger)', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockRejectedValue(new Error('firestore unavailable'));

    await expect(sendEmailAction(confirmedPayload())).rejects.toThrow(/could not be verified/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('derives the recipient and therapist from the stored booking, ignoring payload therapist mismatch', async () => {
    await sendEmailAction({ ...confirmedPayload(), therapistId: 'th_OTHER' });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe('ananya@example.com'); // booking email, nothing else
    expect(adminMocked.__mocks.therapistDocId).toHaveBeenCalledWith('th_priya'); // booking's therapist
  });

  it('sends the therapist copy only to the booking\'s assigned therapist email', async () => {
    await sendEmailAction({ type: 'booking-rescheduled', bookingId: 'bk_1', therapistId: 'th_priya' });

    const calls = sendMock.mock.calls.map((c) => c[0]);
    const recipients = calls.map((c) => c.to).sort();
    expect(recipients).toEqual(['ananya@example.com', 'priya@saarthi.com']);
  });
});

describe('sendEmailAction — idempotency & simulation', () => {
  it('skips dispatch when this booking+type email was already sent (duplicate request converges)', async () => {
    adminMocked.__mocks.emailsGet.mockResolvedValue({
      exists: true,
      data: () => ({ status: 'sent', attempts: [{ response: { id: 'original' } }] }),
    });

    const result = await sendEmailAction(confirmedPayload());

    // sendEmailAction wraps the inner sendEmailWithRetry result
    expect(result).toMatchObject({ success: true, data: { success: true, alreadySent: true } });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('simulates (and does not dispatch) when RESEND_API_KEY is absent', async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmailAction(confirmedPayload());

    expect(result).toMatchObject({ success: true, simulated: true });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
