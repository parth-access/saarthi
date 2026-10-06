import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('../../../../lib/auth/verifySession', () => ({
  verifySession: vi.fn(),
}));

const therapistGet = vi.fn();

vi.mock('../../../../lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: therapistGet })),
    })),
  },
}));

vi.mock('@/domains/booking', () => ({
  LockSlotCommand: class {},
  LockSlotCommandHandler: class {
    execute() {
      return Promise.resolve({ success: true, lockId: 'lock_1' });
    }
  },
  SlotReservationService: { getSlotId: vi.fn(() => 'slot_1') },
}));

import { POST } from './route';
import { verifySession } from '../../../../lib/auth/verifySession';

function post(body: unknown = { therapistId: 'th_1', date: '2026-10-10', time: '10:00', lockId: 'l_1' }) {
  return POST(
    new Request('http://localhost/api/bookings/lock-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifySession).mockResolvedValue({ uid: 'user_1' } as never);
  therapistGet.mockResolvedValue({ exists: true, data: () => ({ id: 'th_1', active: true }) });
});

describe('POST /api/bookings/lock-slot — bookability gate', () => {
  it('refuses a slot pin on a deactivated therapist', async () => {
    therapistGet.mockResolvedValue({ exists: true, data: () => ({ id: 'th_1', active: false }) });
    const res = await post();
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('This therapist is not currently bookable.');
  });

  it('lets a pin proceed for a bookable therapist', async () => {
    const res = await post();
    expect(res.status).toBe(200);
  });

  it('still 404s a therapist who does not exist', async () => {
    therapistGet.mockResolvedValue({ exists: false, data: () => ({}) });
    const res = await post();
    expect(res.status).toBe(404);
  });
});
