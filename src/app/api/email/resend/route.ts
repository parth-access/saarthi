import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { resendSavedEmailAction } from '../emailSender';
import { logger } from '../../_lib/logger';

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) return authResult;
    const session = authResult;

    const body = await request.json();
    const { emailId } = body;
    if (!emailId || typeof emailId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid emailId' }, { status: 400 });
    }

    await resendSavedEmailAction(emailId);

    logger.info('EMAIL', `Manual resend initiated by admin for email ${emailId}`, { adminUid: session.uid });
    return NextResponse.json({ success: true, emailId });

  } catch (error) {
    logger.error('EMAIL', 'Error resending email via admin action', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
