import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Booking events recorded by BookingDomainService are flat (no `booking`
 * snapshot). Every listener must handle that shape: a throw fails the outbox
 * row (retried, then dead-lettered) and, for BookingRejected, the customer's
 * decline email was never sent.
 */
const h = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  info: vi.fn(),
}));

vi.mock('@/app/api/email/emailSender', () => ({ sendEmailAction: h.sendEmail }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));
vi.mock('@/shared/logger', () => ({
  logger: { info: h.info, warn: vi.fn(), error: vi.fn(), withContext: () => ({ audit: vi.fn() }) },
}));

import { registerAuditListeners } from './AuditListener';
import { registerEmailListeners } from './EmailListener';
import { registerNotificationListeners } from './NotificationListener';
import { registerTimelineListeners } from './TimelineListener';

type Listener = (event: unknown) => Promise<void>;

function busWith(...register: Array<(bus: unknown) => void>) {
  const listeners: Record<string, Listener[]> = {};
  const bus = { subscribe: (name: string, fn: Listener) => (listeners[name] ??= []).push(fn) };
  register.forEach((r) => r(bus));
  return (name: string, payload: Record<string, unknown>) =>
    Promise.all((listeners[name] ?? []).map((fn) => fn({ name, payload, correlationId: 'c1' })));
}

const publish = busWith(registerAuditListeners, registerEmailListeners, registerNotificationListeners, registerTimelineListeners);

beforeEach(() => vi.clearAllMocks());

describe('listeners on flat booking events', () => {
  it.each([
    ['BookingAwaitingPayment', { bookingId: 'bk_1', therapistId: 't1', userId: 'uid_1', amount: 1500, currency: 'INR' }],
    ['BookingPaymentInitiated', { bookingId: 'bk_1', therapistId: 't1', userId: null }],
    ['BookingConfirmed', { bookingId: 'bk_1', therapistId: 't1', userId: 'uid_1', metadata: { source: 'webhook' } }],
    ['BookingCancelled', { bookingId: 'bk_1', therapistId: 't1', reason: 'Payment timeout' }],
    ['BookingRejected', { bookingId: 'bk_1', therapistId: 't1', reason: 'Unavailable', declinedBy: 'therapist' }],
    ['BookingRescheduled', { bookingId: 'bk_1', therapistId: 't1', date: '2026-11-02', time: '10:00' }],
    ['BookingNoShow', { bookingId: 'bk_1', therapistId: 't1' }],
  ])('%s does not throw', async (name, payload) => {
    await expect(publish(name, payload)).resolves.toBeDefined();
  });

  it('sends the decline email from a flat BookingRejected event', async () => {
    await publish('BookingRejected', {
      bookingId: 'bk_1', therapistId: 't1', reason: 'Therapist unavailable', customNote: 'Sorry!', declinedBy: 'therapist',
    });
    expect(h.sendEmail).toHaveBeenCalledWith({
      type: 'booking-declined',
      bookingId: 'bk_1',
      therapistId: 't1',
      declineReason: 'Therapist unavailable',
      declineCustomNote: 'Sorry!',
    });
  });

  it('never logs the patient name or phone', async () => {
    await publish('BookingConfirmed', { bookingId: 'bk_1', booking: { name: 'Asha Rao', phone: '+919999999999' } });
    const logged = JSON.stringify(h.info.mock.calls);
    expect(logged).not.toContain('Asha Rao');
    expect(logged).not.toContain('+919999999999');
  });
});
