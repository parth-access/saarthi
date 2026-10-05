/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FollowUpBookingService } from './followUpBookingService';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { CreateBookingCommand } from '@/domains/booking/commands/CreateBookingCommand';
import type { Booking } from '@/domains/booking/entities/Booking';

const mocks = vi.hoisted(() => ({ therapistAuthId: 'th_auth_1' }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: async () => ({
          exists: true,
          data: () => ({ authId: mocks.therapistAuthId }),
        }),
      })),
    })),
  },
}));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: {
    findById: vi.fn(),
  },
}));

vi.mock('@/domains/booking/commands/CreateBookingCommand', () => ({
  CreateBookingCommand: vi.fn(),
  CreateBookingCommandHandler: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      bookingId: 'bk_followup_new',
      orderId: 'order_123',
      amount: 120000,
      currency: 'INR',
    }),
  })),
}));

function makeCompletedBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'bk_source',
    status: 'completed',
    therapistId: 'th_1',
    userId: 'usr_1',
    email: 'client@example.com',
    name: 'Client',
    phone: '9876543210',
    sessionMode: 'online',
    ...overrides,
  } as Booking;
}

const therapist = { uid: 'th_auth_1', role: 'therapist' };

describe('FollowUpBookingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.therapistAuthId = 'th_auth_1';
  });

  it('schedules a follow-up through the canonical booking command with linkage', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeCompletedBooking());

    const res = await FollowUpBookingService.scheduleFollowUp({
      sourceBookingId: 'bk_source',
      date: '2026-10-01',
      time: '14:30',
      therapist,
    });

    expect(res.success).toBe(true);
    expect(res.bookingId).toBe('bk_followup_new');
    expect(CreateBookingCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        therapistId: 'th_1',
        email: 'client@example.com',
        previousBookingId: 'bk_source',
      }),
      'usr_1',
      'client@example.com'
    );
  });

  it('rejects scheduling when the source session is not completed', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(
      makeCompletedBooking({ status: 'confirmed' })
    );

    const res = await FollowUpBookingService.scheduleFollowUp({
      sourceBookingId: 'bk_source',
      date: '2026-10-01',
      time: '14:30',
      therapist,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/completed/);
    expect(vi.mocked(CreateBookingCommand)).not.toHaveBeenCalled();
  });

  it('rejects a therapist who does not own the source session', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeCompletedBooking());
    // therapist doc belongs to someone else
    mocks.therapistAuthId = 'different_therapist';

    const res = await FollowUpBookingService.scheduleFollowUp({
      sourceBookingId: 'bk_source',
      date: '2026-10-01',
      time: '14:30',
      therapist,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/);
    expect(vi.mocked(CreateBookingCommand)).not.toHaveBeenCalled();
  });

  it('rejects non-therapist actors', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeCompletedBooking());

    const res = await FollowUpBookingService.scheduleFollowUp({
      sourceBookingId: 'bk_source',
      date: '2026-10-01',
      time: '14:30',
      therapist: { uid: 'usr_1', role: 'client' },
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/);
  });
});
