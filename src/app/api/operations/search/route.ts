/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { logger } from '../../_lib/logger';

/**
 * Admin ops search.
 *
 * The match semantics are SUBSTRING search across several fields, which
 * Firestore cannot serve with an index. The original implementation fetched the
 * ENTIRE bookings, emails and timelines collections on every keystroke-shaped
 * request — unbounded reads that scale linearly (in cost and latency) with the
 * total data volume. That is a production cost/timeout hazard and a
 * self-inflicted DoS even behind requireAdmin.
 *
 * Bounded contract (this route):
 *   - minimum 3-character query (booking/order/email ids are long; shorter
 *     queries scan everything for near-zero information);
 *   - each collection is scanned most-recent-first with a hard ceiling
 *     (SCAN_LIMIT), so a search is at most 3 × SCAN_LIMIT reads no matter how
 *     large the collections grow;
 *   - results stay capped (10/10/30) as before.
 *
 * Known limitation (documented, accepted): older records beyond SCAN_LIMIT are
 * not searchable here. A full-text/exact-match upgrade path is a dedicated
 * search index (e.g. Typesense/Algolia sync from the outbox) — out of scope for
 * this remediation.
 */

const MIN_QUERY_LENGTH = 3;
const SCAN_LIMIT = 1000;
const MAX_BOOKINGS = 10;
const MAX_EMAILS = 10;
const MAX_TIMELINES = 30;

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) return authResult;

    const q = req.nextUrl.searchParams.get('q') || '';
    const lowerQ = q.toLowerCase().trim();

    if (lowerQ.length < MIN_QUERY_LENGTH) {
      return NextResponse.json(
        { error: `Query must be at least ${MIN_QUERY_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // 1. Most recent bookings (bounded). Requires createdAt on the docs, which
    //    every booking write path sets.
    const bookingsSnap = await adminDb
      .collection('bookings')
      .orderBy('createdAt', 'desc')
      .limit(SCAN_LIMIT)
      .get();
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const filteredBookings = bookings.filter((b: any) => {
      return (
        b.id?.toLowerCase().includes(lowerQ) ||
        b.name?.toLowerCase().includes(lowerQ) ||
        b.email?.toLowerCase().includes(lowerQ) ||
        b.phone?.includes(lowerQ) ||
        b.therapistName?.toLowerCase().includes(lowerQ) ||
        b.sessionType?.toLowerCase().includes(lowerQ) ||
        b.razorpayOrderId?.toLowerCase().includes(lowerQ) ||
        b.razorpayPaymentId?.toLowerCase().includes(lowerQ)
      );
    });

    // 2. Most recent emails (bounded).
    const emailsSnap = await adminDb
      .collection('emails')
      .orderBy('createdAt', 'desc')
      .limit(SCAN_LIMIT)
      .get();
    const emails = emailsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const filteredEmails = emails.filter((e: any) => {
      return (
        e.id?.toLowerCase().includes(lowerQ) ||
        e.recipient?.toLowerCase().includes(lowerQ) ||
        e.subject?.toLowerCase().includes(lowerQ) ||
        e.bookingId?.toLowerCase().includes(lowerQ)
      );
    });

    // 3. Most recent timelines (bounded).
    const timelinesSnap = await adminDb
      .collection('timelines')
      .orderBy('createdAt', 'desc')
      .limit(SCAN_LIMIT)
      .get();
    const timelines = timelinesSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : null
      };
    });

    const filteredTimelines = timelines.filter((t: any) => {
      return (
        t.id?.toLowerCase().includes(lowerQ) ||
        t.correlationId?.toLowerCase().includes(lowerQ) ||
        t.bookingId?.toLowerCase().includes(lowerQ) ||
        t.paymentId?.toLowerCase().includes(lowerQ) ||
        t.emailId?.toLowerCase().includes(lowerQ) ||
        t.message?.toLowerCase().includes(lowerQ) ||
        t.event?.toLowerCase().includes(lowerQ)
      );
    });

    return NextResponse.json({
      bookings: filteredBookings.slice(0, MAX_BOOKINGS),
      emails: filteredEmails.slice(0, MAX_EMAILS),
      timelines: filteredTimelines.slice(0, MAX_TIMELINES)
    });
  } catch (error: any) {
    // Opaque error to the client; details go to logs only.
    logger.error('OPERATIONS', 'Ops search failed', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
