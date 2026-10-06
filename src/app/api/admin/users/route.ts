import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import {
  USERS_PAGE_SIZE,
  countAdministrators,
  findUsersByEmail,
  listUsersPage,
} from './usersSources';
import { isUserRole, type UserRole } from '@/domains/admin/usersTriage';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Accounts for the Users & roles screen, in two modes:
 *
 *  - default: a cursor-paged page of accounts, newest first, optionally
 *    filtered by exact role (`?role=admin|therapist|client` — anything else is
 *    refused, the vocabulary is closed);
 *  - `?email=`: an exact-match lookup of at most five accounts. This is the
 *    path that reaches accounts missing a `createdAt` field, which paged
 *    ordering silently drops — the screen states that caveat.
 *
 * The response also carries `selfUid` so the screen can mark the signed-in
 * administrator's own row (its controls are disabled there — the server
 * refuses self-mutations regardless) and the administrator count for context.
 * Every read is bounded; nothing scans the collection.
 */
const CURSOR_PATTERN = /^(\d+)_([A-Za-z0-9_-]+)$/; // createdAtMs_id
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export async function GET(req: NextRequest) {
  const authorized = await requireAdmin(req as unknown as Request);
  if (authorized instanceof NextResponse) return authorized;
  const session = authorized;

  const params = new URL(req.url).searchParams;
  const rawEmail = params.get('email');
  const rawRole = params.get('role');

  let roleFilter: UserRole | 'all' = 'all';
  if (rawRole && rawRole !== 'all') {
    if (!isUserRole(rawRole)) {
      return NextResponse.json(
        { success: false, error: 'That role filter is not one the console can apply.' },
        { status: 400 }
      );
    }
    roleFilter = rawRole;
  }

  let cursor: { createdAtMs: number; id: string } | null = null;
  const rawCursor = params.get('cursor');
  if (rawCursor && !rawEmail) {
    const match = CURSOR_PATTERN.exec(rawCursor);
    if (!match) {
      return NextResponse.json(
        { success: false, error: 'That page cursor is not valid. Go back to the first page.' },
        { status: 400 }
      );
    }
    cursor = { createdAtMs: Number(match[1]), id: match[2] };
  }

  try {
    const scan = rawEmail
      ? EMAIL_PATTERN.test(rawEmail)
        ? await findUsersByEmail(rawEmail)
        : { ok: false as const, reason: 'That is not a well-formed email address.' }
      : await listUsersPage(cursor, roleFilter);

    const administrators = await countAdministrators();

    const noStore = { 'Cache-Control': 'private, no-store' };
    if (!scan.ok) {
      // A failed read is data, not an empty list: the screen renders the
      // reason verbatim and calls the page missing, not empty.
      return NextResponse.json(
        {
          success: true,
          generatedAtIso: new Date().toISOString(),
          selfUid: session.uid,
          mode: rawEmail ? 'emailLookup' : 'page',
          users: { ok: false, reason: scan.reason },
          nextCursor: null,
          pageSize: 0,
          administrators,
        },
        { headers: noStore }
      );
    }

    return NextResponse.json(
      {
        success: true,
        generatedAtIso: new Date().toISOString(),
        selfUid: session.uid,
        mode: rawEmail ? 'emailLookup' : 'page',
        users: { ok: true, rows: scan.page.rows, hasMore: scan.page.nextCursor !== null },
        nextCursor: scan.page.nextCursor
          ? `${scan.page.nextCursor.createdAtMs}_${scan.page.nextCursor.id}`
          : null,
        pageSize: rawEmail ? null : USERS_PAGE_SIZE,
        administrators,
      },
      { headers: noStore }
    );
  } catch (error) {
    logger.error('SYSTEM', 'Admin users list failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load the accounts right now. Please try again.' },
      { status: 500 }
    );
  }
}
