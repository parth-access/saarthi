/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TherapistPostSessionService } from './therapistPostSessionService';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import type { Booking } from '@/domains/booking/entities/Booking';

vi.mock('@/lib/firebase/admin', () => {
  const notesDoc = vi.fn();
  const therapistDoc = vi.fn();
  const notesCollection = vi.fn(() => ({ doc: notesDoc }));
  const therapistsCollection = vi.fn(() => ({ doc: therapistDoc }));

  // Generic chainable stub for collections like `bookings` (audit_logs subcollection etc.)
  const chainableDoc = () => ({
    collection: vi.fn(() => ({ doc: chainableDoc })),
    update: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  });

  return {
    adminDb: {
      collection: vi.fn((name: string) => {
        if (name === 'session_notes') return notesCollection();
        if (name === 'therapists') return therapistsCollection();
        return { doc: chainableDoc };
      }),
      runTransaction: vi.fn(),
    },
  };
});

vi.mock('@/shared/events/outbox', () => ({
  OutboxService: {
    recordEventInTransaction: vi.fn(),
  },
  OutboxProcessor: {
    processEvent: vi.fn().mockResolvedValue(undefined),
  },
  generateDeterministicEventId: vi.fn((_agg: string, id: string, name: string) => `${id}_${name}`),
}));

vi.mock('@/domains/audit/AuditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: {
    findById: vi.fn(),
  },
}));

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'bk_notes',
    status: 'completed',
    therapistId: 'th_1',
    userId: 'usr_1',
    email: 'client@example.com',
    name: 'Client',
    ...overrides,
  } as Booking;
}

const therapistActor = { uid: 'th_auth_1', role: 'therapist' };
const clientActor = { uid: 'usr_1', email: 'client@example.com' };

describe('TherapistPostSessionService — authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockTherapistOwner(isOwner: boolean) {
    (adminDb.collection('therapists').doc as any).mockImplementation(() => ({
      get: async () => ({
        exists: true,
        data: () => ({ authId: isOwner ? 'th_auth_1' : 'someone_else' }),
      }),
    }));
  }

  it('therapist can create notes for own completed session', async () => {
    mockTherapistOwner(true);
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    const notesRefMock = { exists: false };
    (adminDb.collection('session_notes').doc as any).mockReturnValue(notesRefMock);
    (adminDb.runTransaction as any).mockImplementation(async (fn: (t: unknown) => Promise<void>) => {
      const t = {
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        set: vi.fn(),
        update: vi.fn(),
      };
      await fn(t);
      return t as any;
    });

    const res = await TherapistPostSessionService.saveSessionNotes(
      { bookingId: 'bk_notes', privateNotes: 'Private reflections', clientSummary: 'We discussed…' },
      therapistActor
    );

    expect(res.success).toBe(true);
    expect(res.alreadyExisted).toBe(false);
  });

  it('other therapist cannot save notes for a session they do not own', async () => {
    mockTherapistOwner(false);
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    const res = await TherapistPostSessionService.saveSessionNotes(
      { bookingId: 'bk_notes', privateNotes: 'sneaky' },
      therapistActor
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/);
  });

  it('notes cannot be saved for a booking that is not completed', async () => {
    mockTherapistOwner(true);
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking({ status: 'confirmed' }));

    const res = await TherapistPostSessionService.saveSessionNotes(
      { bookingId: 'bk_notes', privateNotes: 'too early' },
      therapistActor
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/completed sessions/);
  });

  it('client cannot view private notes through the therapist endpoint', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    const res = await TherapistPostSessionService.getSessionNotes('bk_notes', { uid: 'usr_1', role: 'client' });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/);
  });

  it('client can view a SHARED summary and it contains no private notes', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    (adminDb.collection('session_notes').doc as any).mockReturnValue({
      get: async () => ({
        exists: true,
        data: () => ({
          clientSummary: 'Key takeaways…',
          clientSummaryShared: true,
          clientSummarySharedAt: { toMillis: () => Date.now() },
          privateNotes: 'MUST NOT LEAK',
        }),
      }),
    });

    const res = await TherapistPostSessionService.getClientSummary('bk_notes', clientActor);

    expect(res.success).toBe(true);
    expect(res.summary?.clientSummary).toBe('Key takeaways…');
    expect(JSON.stringify(res.summary)).not.toContain('MUST NOT LEAK');
  });

  it('client cannot view an UNSHARED summary', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    (adminDb.collection('session_notes').doc as any).mockReturnValue({
      get: async () => ({
        exists: true,
        data: () => ({
          clientSummary: 'Not shared yet',
          clientSummaryShared: false,
        }),
      }),
    });

    const res = await TherapistPostSessionService.getClientSummary('bk_notes', clientActor);

    expect(res.success).toBe(false);
  });

  it('another user cannot view someone else’s summary', async () => {
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    const res = await TherapistPostSessionService.getClientSummary('bk_notes', {
      uid: 'usr_attacker',
      email: 'attacker@example.com',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unauthorized/);
  });

  it('therapist can set follow-up status; invalid values rejected', async () => {
    mockTherapistOwner(true);
    (firestoreBookingRepository.findById as any).mockResolvedValue(makeBooking());

    (adminDb.runTransaction as any).mockImplementation(async (fn: (t: unknown) => Promise<void>) => {
      const t = { update: vi.fn(), set: vi.fn() };
      await fn(t);
      return t as any;
    });

    const notesRefMock = { exists: false };
    (adminDb.collection('session_notes').doc as any).mockReturnValue(notesRefMock);
    (adminDb.runTransaction as any).mockImplementation(async (fn: (t: unknown) => Promise<void>) => {
      const t = {
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        set: vi.fn(),
        update: vi.fn(),
      };
      await fn(t);
      return t as any;
    });

    const ok = await TherapistPostSessionService.setFollowUpStatus(
      { bookingId: 'bk_notes', followUpStatus: 'recommended' },
      therapistActor
    );
    expect(ok.success).toBe(true);

    const bad = await TherapistPostSessionService.setFollowUpStatus(
      { bookingId: 'bk_notes', followUpStatus: 'diagnosed_terminal' as any },
      therapistActor
    );
    expect(bad.success).toBe(false);
  });
});
