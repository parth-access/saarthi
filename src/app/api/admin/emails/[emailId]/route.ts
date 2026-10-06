import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readEmailLogDetail } from '../emailsSources';
import { logger } from '../../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * One email log entry in full: dispatch history and the plaintext backup body.
 * The rendered `html` is never returned — no operator action consumes it, and
 * the plaintext is the recovery/audit copy by design.
 */
const GENERIC_DETAIL_ERROR = 'We could not load this email right now. Please try again.';

export async function GET(req: NextRequest, context: { params: Promise<{ emailId: string }> }) {
  const authorized = await requireAdmin(req as unknown as Request);
  if (authorized instanceof NextResponse) return authorized;

  const { emailId } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(emailId) || emailId.startsWith('__')) {
    return NextResponse.json({ success: false, error: 'That is not a valid email id.' }, { status: 400 });
  }

  const result = await readEmailLogDetail(emailId);
  if (!result.ok) {
    // The detail read fails closed with a fixed sentence; the real error is in
    // the server log.
    logger.warn('EMAIL', `Admin email detail unavailable for ${emailId}`);
    return NextResponse.json({ success: false, error: GENERIC_DETAIL_ERROR }, { status: 404 });
  }

  return NextResponse.json(
    { success: true, email: result.detail },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
