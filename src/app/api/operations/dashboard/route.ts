/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../_lib/logger';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) return authResult;


    // 1. Fetch metrics
    const metricsSnap = await adminDb.collection('daily_metrics').orderBy('date', 'desc').limit(7).get();
    const metrics = metricsSnap.docs.map(d => d.data());

    // 2. Fetch recent timelines
    const timelinesSnap = await adminDb.collection('timelines').orderBy('createdAt', 'desc').limit(100).get();
    const timelines = timelinesSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate().toISOString() : data.createdAt) : null
      };
    });

    // 3. Background queue size — exact counts via the count() aggregation so
    //    a large failed-email backlog costs one index read per query, not one
    //    read per queued document.
    const [queuedCountSnap, failedCountSnap] = await Promise.all([
      adminDb.collection('emails').where('status', '==', 'queued').count().get(),
      adminDb.collection('emails').where('status', '==', 'failed').count().get(),
    ]);

    const workerStatus = {
      queuedCount: queuedCountSnap.data().count,
      failedCount: failedCountSnap.data().count,
      lastPoll: new Date().toISOString(),
      status: 'active'
    };

    // 4. System Diagnostics
    const dbChecked = !!adminDb;
    const resendChecked = !!process.env.RESEND_API_KEY;
    const razorpayChecked = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;

    const diagnostics = {
      firebase: dbChecked ? 'healthy' : 'failed',
      resend: resendChecked ? 'healthy' : 'missing_credentials',
      razorpay: razorpayChecked ? 'healthy' : 'missing_credentials',
      env: process.env.NODE_ENV || 'development'
    };

    return NextResponse.json({
      metrics,
      timelines,
      workerStatus,
      diagnostics
    });
  } catch (error: any) {
    logger.error('OPERATIONS', 'Ops dashboard failed', error);
    return NextResponse.json({ error: 'Dashboard unavailable' }, { status: 500 });
  }
}
