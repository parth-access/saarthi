/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateBookingCommand, CreateBookingCommandHandler } from './CreateBookingCommand';
import { SlotReservationService } from '../services/SlotReservationService';
import { istDatePlusDays } from '@/shared/scheduling/slots';

/**
 * Bookability enforcement in the booking-creation path.
 *
 * `therapists/{id}.active === false` must refuse a NEW booking at the door —
 * before availability is even consulted — while a missing flag means bookable,
 * matching the mapper's default everywhere else the field is read. These tests
 * pin the gate; the create route's 409 mapping and the lock-slot/availability
 * refusals are pinned in their own route tests.
 */

// The therapists doc's stored data, retargetable per test.
let therapistData: Record<string, unknown> = { id: 'therapist_1', active: true };

vi.mock('@/lib/firebase/admin', () => {
  const doc = vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation(async () => ({ exists: true, data: () => therapistData })),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      }),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    }),
  });
  const collection = vi.fn(() => ({ doc }));
  return {
    adminDb: {
      collection,
      runTransaction: vi.fn(),
    },
  };
});

const baseBooking = {
  therapistId: 'therapist_1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  phone: '9876543210',
  date: istDatePlusDays(3),
  time: '10:00',
  sessionMode: 'online',
} as const;

describe('CreateBookingCommand — therapist bookability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    therapistData = { id: 'therapist_1', active: true };
    vi.spyOn(SlotReservationService, 'isSlotInTherapistAvailability').mockResolvedValue(true);
  });

  it('refuses a new booking for a deactivated therapist before any availability work', async () => {
    therapistData = { id: 'therapist_1', active: false };
    const availabilitySpy = vi.spyOn(SlotReservationService, 'isSlotInTherapistAvailability');

    const handler = new CreateBookingCommandHandler();
    await expect(handler.execute(new CreateBookingCommand(baseBooking, 'user_1', 'alice@example.com')))
      .rejects.toThrow('This therapist is not currently bookable.');

    // The refusal happens at the door: the schedule was never consulted.
    expect(availabilitySpy).not.toHaveBeenCalled();
  });

  it('lets a booking proceed for a therapist with no stored flag (missing means bookable)', async () => {
    therapistData = { id: 'therapist_1' };
    vi.spyOn(SlotReservationService, 'isSlotInTherapistAvailability').mockResolvedValue(false);

    const handler = new CreateBookingCommandHandler();
    // Past the bookability gate, the next refusal is the slot's — proving the
    // gate opened rather than the run stopping for another reason.
    await expect(handler.execute(new CreateBookingCommand(baseBooking, 'user_1', 'alice@example.com')))
      .rejects.toThrow("outside the therapist's scheduled hours");
  });
});
