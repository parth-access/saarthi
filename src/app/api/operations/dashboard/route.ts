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

    // 3. Fetch background queue size
    const queuedEmailsSnap = await adminDb.collection('emails').where('status', '==', 'queued').get();
    const failedEmailsSnap = await adminDb.collection('emails').where('status', '==', 'failed').get();
    
    const workerStatus = {
      queuedCount: queuedEmailsSnap.size,
      failedCount: failedEmailsSnap.size,
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
