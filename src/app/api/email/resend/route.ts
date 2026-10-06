import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { resendSavedEmailAction } from '../emailSender';
import { logger } from '../../_lib/logger';
import { checkRateLimit, getClientIp } from '../../_lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Manual resend of one stored email — the stored recipient, subject and bodies,
 * verbatim. This is deliberately not an arbitrary email endpoint: there is no
 * field here a client can set except WHICH stored email to re-drive, and the
 * send resolves its data server-side.
 */
const GENERIC_RESEND_ERROR =
  'The resend did not go through just now. The email log records what happened — reload to read it.';

export async function POST(request: Request) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  // After auth, before work: only a verified admin consumes the bucket.
  const limit = checkRateLimit(getClientIp(request), 'admin_email_resend', 10, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many resends in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let emailId: unknown;
  try {
    const body = await request.json();
    emailId = (body as { emailId?: unknown } | null)?.emailId;
  } catch {
    return NextResponse.json({ error: 'A JSON body with emailId is required.' }, { status: 400 });
  }
  if (!emailId || typeof emailId !== 'string' || emailId.length > 256) {
    return NextResponse.json({ error: 'Missing or invalid emailId' }, { status: 400 });
  }

  try {
    await resendSavedEmailAction(emailId);
  } catch (error) {
    // The action's only authored refusal is a missing log entry; everything else
    // (provider errors included) stays in the server log.
    const message = error instanceof Error ? error.message : '';
    if (message === 'Email log not found') {
      return NextResponse.json({ error: 'No email log exists with that id.' }, { status: 404 });
    }
    logger.error('EMAIL', 'Error resending email via admin action', error, { adminUid: session.uid });
    return NextResponse.json({ error: GENERIC_RESEND_ERROR }, { status: 500 });
  }

  logger.info('EMAIL', `Manual resend initiated by admin for email ${emailId}`, { adminUid: session.uid });
  return NextResponse.json({ success: true, emailId });
}
