import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { listContactsPage, CONTACT_PAGE_SIZE } from './contactsSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The inquiries list, one cursor-paged slice at a time. Status filtering and
 * search are client-side over the loaded pages, so the response carries the
 * page size and the next cursor rather than pretending to be a full ledger.
 */
const CURSOR_PATTERN = /^(\d+)_([A-Za-z0-9_-]+)$/; // createdAtMs_id

export async function GET(req: NextRequest) {
  const authorized = await requireAdmin(req as unknown as Request);
  if (authorized instanceof NextResponse) return authorized;

  let cursor: { createdAtMs: number; id: string } | null = null;
  try {
    const raw = new URL(req.url).searchParams.get('cursor');
    if (raw) {
      const match = CURSOR_PATTERN.exec(raw);
      if (!match) {
        return NextResponse.json(
          { success: false, error: 'That page cursor is not valid. Go back to the first page.' },
          { status: 400 }
        );
      }
      cursor = { createdAtMs: Number(match[1]), id: match[2] };
    }
  } catch {
    cursor = null;
  }

  try {
    const scan = await listContactsPage(cursor);
    if (!scan.ok) {
      return NextResponse.json(
        { success: true, contacts: { ok: false, reason: scan.reason } },
        { headers: { 'Cache-Control': 'private, no-store' } }
      );
    }
    const nextCursor = scan.page.nextCursor
      ? `${scan.page.nextCursor.createdAtMs}_${scan.page.nextCursor.id}`
      : null;
    return NextResponse.json(
      {
        success: true,
        generatedAtIso: new Date().toISOString(),
        contacts: { ok: true, rows: scan.page.rows, hasMore: scan.page.nextCursor !== null },
        nextCursor,
        pageSize: scan.pageSize,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('SYSTEM', 'Admin contacts list failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the inquiries right now. Please try again.' },
      { status: 500 }
    );
  }
}
