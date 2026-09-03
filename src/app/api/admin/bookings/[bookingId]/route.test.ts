import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { GET } from './route';
import { requireAdmin } from '@/lib/auth/requireRole';
import { firestoreBookingRepository } from '@/domains/booking/repository/FirestoreBookingRepository';
import { readBookingAuditTrail } from '@/domains/audit/BookingAuditTrail';
import type { Booking } from '@/domains/booking/entities/Booking';

/**
 * The HTTP edge of the booking detail view.
 *
 * `adminBookingDetail.test.ts` proves the projection and the gating rules; these
 * prove the route applies them and that the ways this endpoint could mislead or
 * over-share are closed:
 *
 *  - a non-admin must never reach Firestore;
 *  - the manage-booking token must not appear in the response;
 *  - a missing booking must be a 404, not an empty-looking detail page;
 *  - a Firestore failure must not put its message in front of the browser;
 *  - a failed audit read must degrade to a stated gap, not to a 500 that denies
 *    an operator the booking they came to act on.
 */

vi.mock('@/lib/auth/requireRole', () => ({ requireAdmin: vi.fn() }));

vi.mock('@/domains/booking/repository/FirestoreBookingRepository', () => ({
  firestoreBookingRepository: { findById: vi.fn() },
}));

vi.mock('@/domains/audit/BookingAuditTrail', () => ({ readBookingAuditTrail: vi.fn() }));

vi.mock('../../../_lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const ADMIN = { uid: 'uid_admin', email: 'ops@saarthi.com', role: 'admin' };

function booking(overrides: Record<string, unknown> = {}): Booking {
  return {
    id: 'bk_20260903_ABCD1234',
    status: 'confirmed',
    paymentStatus: 'paid',
    name: 'Ananya Sharma',
    email: 'ananya@example.com',
    phone: '+91 98765 43210',
    therapistId: 'th_priya',
    date: '2026-09-10',
    time: '09:00',
    sessionType: 'Individual therapy',
    paymentAmount: 1500,
    paymentCurrency: 'INR',
    createdAt: '2026-09-01T10:15:00.000Z',
    ...overrides,
  } as unknown as Booking;
}

const EMPTY_TRAIL = { bookingScoped: [], systemScoped: [], gaps: [], truncated: false };

function get(bookingId = 'bk_20260903_ABCD1234') {
  return GET(new Request(`http://localhost/api/admin/bookings/${bookingId}`), {
    params: Promise.resolve({ bookingId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
  vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking());
  vi.mocked(readBookingAuditTrail).mockResolvedValue(EMPTY_TRAIL);
});

describe('authorization', () => {
  it('answers whatever requireAdmin decided, without reading anything', async () => {
    // The gate is server-side and total. This route is not reachable by a
    // therapist, which distinguishes it from `/api/bookings/update-status`.
    for (const status of [401, 403]) {
      vi.clearAllMocks();
      vi.mocked(requireAdmin).mockResolvedValue(
        NextResponse.json({ error: 'nope' }, { status }) as never
      );
      const res = await get();
      expect(res.status).toBe(status);
      expect(firestoreBookingRepository.findById).not.toHaveBeenCalled();
      expect(readBookingAuditTrail).not.toHaveBeenCalled();
    }
  });
});

describe('booking id validation', () => {
  it('refuses an id that could be read as a Firestore path', async () => {
    // `doc('a/b/c')` resolves to `bookings/a/b/c` — a document in a subcollection
    // of a different booking, which this projection was not built for.
    for (const id of ['a/b/c', '..', '.', '__name__', 'bk_1 ', 'bk_1?x=1', '']) {
      vi.clearAllMocks();
      vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
      const res = await get(id);
      expect(res.status, JSON.stringify(id)).toBe(400);
      expect(firestoreBookingRepository.findById, JSON.stringify(id)).not.toHaveBeenCalled();
    }
  });

  it('accepts the id shapes real bookings actually have', async () => {
    for (const id of [
      'bk_9f2c4d1e8a7b4c3d9e0f1a2b3c4d5e6f', // IdGenerator.booking()
      'bk_20260903_ABCD1234',
      'AbC123dEfG456hIjK789', // Firestore auto-id
    ]) {
      vi.clearAllMocks();
      vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never);
      vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(booking({ id }));
      vi.mocked(readBookingAuditTrail).mockResolvedValue(EMPTY_TRAIL);
      const res = await get(id);
      expect(res.status, id).toBe(200);
      expect(firestoreBookingRepository.findById).toHaveBeenCalledWith(id);
    }
  });

  it('says a malformed id is malformed rather than answering 404', async () => {
    // A 404 would tell an operator the booking is gone. It is the request that is
    // wrong, and the copy has to distinguish the two.
    const body = await (await get('a/b/c')).json();
    expect(body).toEqual({ success: false, error: 'That is not a valid booking id.' });
  });
});

describe('a booking that exists', () => {
  it('returns the detail, the timeline and the available actions together', async () => {
    // One round trip: the screen should never render half-populated while it waits
    // for a second request to decide which buttons to show.
    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.booking.id).toBe('bk_20260903_ABCD1234');
    expect(body.timeline.entries).toEqual([]);
    expect(Array.isArray(body.actions)).toBe(true);
    expect(body.actions.map((a: { action: string }) => a.action)).toEqual([
      'confirm',
      'cancel',
      'complete',
      'no_show',
      'reschedule',
    ]);
  });

  it('never serializes the manage-booking token', async () => {
    // The token authorizes cancel and reschedule with no sign-in at all.
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(
      booking({ bookingToken: 'tok_live_secret', message: 'Struggling with panic attacks.' })
    );
    const raw = await (await get()).text();

    expect(raw).not.toContain('tok_live_secret');
    expect(raw).not.toContain('panic attacks');
    expect(JSON.parse(raw).booking.access.hasManageToken).toBe(true);
    expect(JSON.parse(raw).booking.client.hasNote).toBe(true);
  });

  it('gates actions on the booking it actually loaded', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(
      booking({ status: 'completed' })
    );
    const body = await (await get()).json();

    for (const verdict of body.actions) {
      expect(verdict.allowed, verdict.action).toBe(false);
      expect(verdict.reason.length, verdict.action).toBeGreaterThan(0);
    }
  });

  it('is not cached, since a stale booking is one an operator acts on wrongly', async () => {
    const res = await get();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('merges both audit collections into one ordered trail', async () => {
    vi.mocked(readBookingAuditTrail).mockResolvedValue({
      bookingScoped: [
        { id: 'a1', data: { action: 'status_updated', timestamp: '2026-09-02T10:00:00.000Z' } },
      ],
      systemScoped: [
        { id: 'g1', data: { eventType: 'PAYMENT_SUCCEEDED', timestamp: '2026-09-02T09:00:00.000Z' } },
        { id: 'g2', data: { eventType: 'SLOT_HELD', timestamp: '2026-09-02T11:00:00.000Z' } },
      ],
      gaps: [],
      truncated: false,
    });

    const body = await (await get()).json();
    expect(body.timeline.entries.map((e: { id: string }) => e.id)).toEqual(['g2', 'a1', 'g1']);
  });
});

describe('a booking that does not exist', () => {
  it('answers 404 rather than an empty detail page', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null);
    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ success: false, error: 'No booking exists with that id.' });
  });

  it('does not read the audit trail for a booking it could not find', async () => {
    vi.mocked(firestoreBookingRepository.findById).mockResolvedValue(null);
    await get();
    expect(readBookingAuditTrail).not.toHaveBeenCalled();
  });
});

describe('failure', () => {
  it('replaces a Firestore error with copy that leaks nothing', async () => {
    // The real message names the project and, for a missing index, carries a
    // console URL with it.
    vi.mocked(firestoreBookingRepository.findById).mockRejectedValue(
      new Error('7 PERMISSION_DENIED: Missing or insufficient permissions on project saarthi-prod')
    );
    const res = await get();
    const raw = await res.text();

    expect(res.status).toBe(500);
    expect(raw).not.toContain('saarthi-prod');
    expect(raw).not.toContain('PERMISSION_DENIED');
    expect(JSON.parse(raw)).toEqual({
      success: false,
      error: 'We could not load this booking right now. Please try again.',
    });
  });

  it('still returns the booking when the audit trail could not be read', async () => {
    // History is context; the booking is the reason the operator is here. Failing
    // the page over a failed audit read would deny them the action they came for.
    vi.mocked(readBookingAuditTrail).mockResolvedValue({
      bookingScoped: [],
      systemScoped: [{ id: 'g1', data: { eventType: 'SLOT_HELD', timestamp: null } }],
      gaps: ['booking'],
      truncated: false,
    });

    const res = await get();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.booking.id).toBe('bk_20260903_ABCD1234');
    expect(body.timeline.gaps).toEqual(['booking']);
    expect(body.timeline.entries).toHaveLength(1);
  });

  it('reports a truncated trail so an operator does not read it as complete', async () => {
    vi.mocked(readBookingAuditTrail).mockResolvedValue({
      ...EMPTY_TRAIL,
      truncated: true,
    });
    const body = await (await get()).json();
    expect(body.timeline.truncated).toBe(true);
  });

  it('fails the request if the audit reader itself throws', async () => {
    // `readBookingAuditTrail` already swallows per-query failures into `gaps`. If
    // it throws anyway, something unmodelled is wrong and the generic 500 applies
    // rather than a page that silently claims no history exists.
    vi.mocked(readBookingAuditTrail).mockRejectedValue(new Error('adminDb is not initialized'));
    const res = await get();

    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('adminDb');
  });
});
