import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { resendSavedEmailAction } from '../emailSender';
import { logger } from '../../_lib/logger';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Forbidden: Invalid token' }, { status: 403 });
    }

    // Verify user role is admin
    const userSnap = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Administrator permissions required' }, { status: 403 });
    }

    const body = await request.json();
    const { emailId } = body;
    if (!emailId || typeof emailId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid emailId' }, { status: 400 });
    }

    await resendSavedEmailAction(emailId);

    logger.info('EMAIL', `Manual resend initiated by admin for email ${emailId}`, { adminUid: decodedToken.uid });
    return NextResponse.json({ success: true, emailId });

  } catch (error) {
    logger.error('EMAIL', 'Error resending email via admin action', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
