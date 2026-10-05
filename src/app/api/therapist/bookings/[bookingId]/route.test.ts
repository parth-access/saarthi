import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from './route';
import { verifySession } from '@/lib/auth/verifySession';
import { adminDb } from '@/lib/firebase/admin';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';

/**
 * The HTTP edge of the therapist booking detail view.
 *
 * Proves the authorization matrix and the privacy boundary:
 *  - no session → 401; client role → 403;
 *  - a booking that does not exist and one owned by another therapist are the
 *    same 404, so the endpoint cannot be probed for other therapists' booking ids;
 *  - the assigned therapist and an admin get the booking;
 *  - operator-only fields (manage token, internal errors) never leave the server.
 */

vi.mock('@/lib/auth/verifySession', () => ({ verifySession: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({ empty: false, docs: [{ id: 'th_assigned', get: async () => ({ exists: true }) }] })),
        })),
      })),
    })),
  },
}));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: { findById: vi.fn() },
}));

vi.mock('../../../../app/api/_lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk_20260915_3B221AE5',
    status: 'confirmed',
    therapistId: 'th_assigned',
    name: 'Client A',
    email: 'clienta@example.com',
    phone: '+91 98000 00000',
    date: '2026-09-15',
    time: '19:00',
    bookingToken: 'secret_manage_token_value',
    invalidToken: false,
    lastEmailError: 'internal smtp detail',
    calendarError: 'internal calendar detail',
    reminderError: 'internal reminder detail',
    ...overrides,
  };
}

function get(bookingId = 'bk_20260915_3B221AE5') {
  return GET(new Request(`http://localhost/api/therapist/bookings/${bookingId}`), {
    params: Promise.resolve({ bookingId }),
  });
}

/** Point the ownership lookup at a specific therapist doc id (or none). */
function mockTherapistLookup(docId: string | null) {
  vi.mocked(adminDb.collection as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    where: () => ({
      limit: () => ({
        get: async () =>
          docId === null
            ? { empty: true, docs: [] }
            : { empty: false, docs: [{ id: docId }] },
      }),
    }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking() as never);
});

describe('GET /api/therapist/bookings/[bookingId] — authorization', () => {
  it('401 without a session', async () => {
    vi.mocked(verifySession).mockResolvedValue(null as never);
    const res = await get();
    expect(res.status).toBe(401);
  });

  it('403 for a client role', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'u1', role: 'client' } as never);
    const res = await get();
    expect(res.status).toBe(403);
  });

  it('200 for the assigned therapist', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_auth_uid', role: 'therapist' } as never);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.booking.id).toBe('bk_20260915_3B221AE5');
  });

  it('200 for an admin without an ownership check', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'uid_admin', role: 'admin' } as never);
    const res = await get();
    expect(res.status).toBe(200);
    // The therapists-collection ownership lookup must not have run.
    expect(adminDb.collection).not.toHaveBeenCalled();
  });

  it('404 (not 403) for a therapist who is not assigned — no existence oracle', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'other_therapist_uid', role: 'therapist' } as never);
    mockTherapistLookup('th_other');

    const res = await get();
    expect(res.status).toBe(404);
    const body = await res.json();
    // Identical body to the not-found case.
    expect(body.error).toBe('No booking exists with that id.');
  });

  it('404 when the therapist profile is missing entirely', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'ghost', role: 'therapist' } as never);
    mockTherapistLookup(null);

    const res = await get();
    expect(res.status).toBe(404);
  });

  it('404 for a nonexistent booking', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_auth_uid', role: 'therapist' } as never);
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null as never);
    const res = await get('bk_does_not_exist');
    expect(res.status).toBe(404);
  });

  it('400 for a malformed booking id', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_auth_uid', role: 'therapist' } as never);
    const res = await get('bad/id');
    expect(res.status).toBe(400);
  });

  it('500 without leaking the Firestore error message', async () => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_auth_uid', role: 'therapist' } as never);
    vi.mocked(firestoreBookingRepository.findById).mockRejectedValue(new Error('project saarthi: missing index abc') as never);
    const res = await get();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toContain('index');
    expect(body.error).not.toContain('saarthi');
  });
});

describe('GET /api/therapist/bookings/[bookingId] — projection', () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue({ uid: 'th_auth_uid', role: 'therapist' } as never);
    // Restore the assigned-therapist ownership lookup: earlier tests in the
    // auth matrix replaced its implementation and clearAllMocks does not.
    mockTherapistLookup('th_assigned');
  });

  it('withholds operator-only fields from the response', async () => {
    const res = await get();
    const body = await res.json();
    const payload = JSON.stringify(body);
    expect(payload).not.toContain('secret_manage_token_value');
    expect(payload).not.toContain('internal smtp detail');
    expect(payload).not.toContain('internal calendar detail');
    expect(payload).not.toContain('internal reminder detail');
    expect(payload).not.toContain('invalidToken');
  });

  it('keeps therapist-relevant fields, including post-session pointers', async () => {
    const res = await get();
    const body = await res.json();
    expect(body.booking.name).toBe('Client A');
    expect(body.booking.status).toBe('confirmed');
    expect(body.booking.hasSessionNotes).toBeUndefined(); // not set on this fixture
  });

  it('includes post-session pointers when present', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(
      booking({ status: 'completed', hasSessionNotes: true, followUpStatus: 'recommended', clientSummaryShared: true }) as never
    );
    const res = await get();
    const body = await res.json();
    expect(body.booking.hasSessionNotes).toBe(true);
    expect(body.booking.followUpStatus).toBe('recommended');
    expect(body.booking.clientSummaryShared).toBe(true);
  });
});
