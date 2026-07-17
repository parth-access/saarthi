/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (decodedToken.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = req.nextUrl.searchParams.get('q') || '';
    const lowerQ = q.toLowerCase().trim();

    if (!lowerQ) {
      return NextResponse.json({ bookings: [], emails: [], timelines: [] });
    }

    // 1. Fetch bookings
    const bookingsSnap = await adminDb.collection('bookings').get();
    const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter bookings
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

    // 2. Fetch emails
    const emailsSnap = await adminDb.collection('emails').get();
    const emails = emailsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter emails
    const filteredEmails = emails.filter((e: any) => {
      return (
        e.id?.toLowerCase().includes(lowerQ) ||
        e.recipient?.toLowerCase().includes(lowerQ) ||
        e.subject?.toLowerCase().includes(lowerQ) ||
        e.bookingId?.toLowerCase().includes(lowerQ)
      );
    });

    // 3. Fetch timelines
    const timelinesSnap = await adminDb.collection('timelines').orderBy('createdAt', 'desc').get();
    const timelines = timelinesSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : null
      };
    });

    // Filter timelines
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
      bookings: filteredBookings.slice(0, 10),
      emails: filteredEmails.slice(0, 10),
      timelines: filteredTimelines.slice(0, 30)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
