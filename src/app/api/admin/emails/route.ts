import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import {
  findEmailLogsForBooking,
  listRecentEmailLogs,
  EMAIL_LIST_LIMIT,
} from './emailsSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The email log list: the most recent slice, or every email logged for one
 * booking. The `html` and `text` bodies are deliberately absent — the plaintext
 * backup travels only on the single-email detail read, where one email has been
 * asked for.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  let bookingId: string | null = null;
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('bookingId');
    // A malformed booking id cannot match anything; refuse it rather than
    // silently answering with the recent list.
    if (raw !== null) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(raw) || raw.startsWith('__')) {
        return NextResponse.json({ success: false, error: 'That is not a valid booking id.' }, { status: 400 });
      }
      bookingId = raw;
    }
  } catch {
    bookingId = null;
  }

  try {
    const scan = bookingId
      ? await findEmailLogsForBooking(bookingId)
      : await listRecentEmailLogs();
    return NextResponse.json(
      {
        success: true,
        generatedAtIso: new Date().toISOString(),
        emails: scan,
        bookingId,
        scanLimit: EMAIL_LIST_LIMIT,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('SYSTEM', 'Admin email log failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the email log right now. Please try again.' },
      { status: 500 }
    );
  }
}
