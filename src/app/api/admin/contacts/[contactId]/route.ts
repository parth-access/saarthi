import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/requireRole';
import { updateContactStatus, deleteContact } from './contactsSources';
import { checkRateLimit, getClientIp } from '../../../_lib/rateLimit';
import { logger } from '../../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * One inquiry: PATCH to set its status, DELETE to remove it entirely.
 *
 * The id guard is the same shape as the booking/email guards — the doc id is
 * client-supplied and becomes a Firestore path segment, so anything outside the
 * readable-id alphabet is refused before it reaches the collection.
 */
const statusSchema = z.object({
  // The vocabulary is enforced here, at the boundary, as well as in the source
  // module — a mocked or refactored layer must not become a path to writing an
  // arbitrary status.
  status: z.enum(['unread', 'resolved', 'spam']),
});

const GENERIC_MUTATION_ERROR = 'That is not a valid inquiry id.';
const UNREADABLE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function PATCH(req: NextRequest, context: { params: Promise<{ contactId: string }> }) {
  const authorized = await requireAdmin(req as unknown as Request);
  if (authorized instanceof NextResponse) return authorized;

  const limit = checkRateLimit(getClientIp(req), 'admin_contact_status', 30, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many updates in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { contactId } = await context.params;
  if (!UNREADABLE_ID.test(contactId) || contactId.startsWith('__')) {
    return NextResponse.json({ error: GENERIC_MUTATION_ERROR }, { status: 400 });
  }

  let status: string;
  try {
    const parsed = statusSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'A status is required.' }, { status: 400 });
    }
    status = parsed.data.status;
  } catch {
    return NextResponse.json({ error: 'A JSON body with status is required.' }, { status: 400 });
  }

  const result = await updateContactStatus(contactId, status);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  logger.info('CONTACTS', `Admin set inquiry ${contactId} status to ${status}`);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ contactId: string }> }) {
  const authorized = await requireAdmin(req as unknown as Request);
  if (authorized instanceof NextResponse) return authorized;

  const limit = checkRateLimit(getClientIp(req), 'admin_contact_delete', 15, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many deletes in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { contactId } = await context.params;
  if (!UNREADABLE_ID.test(contactId) || contactId.startsWith('__')) {
    return NextResponse.json({ error: GENERIC_MUTATION_ERROR }, { status: 400 });
  }

  const result = await deleteContact(contactId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  logger.info('CONTACTS', `Admin deleted inquiry ${contactId}`);
  return NextResponse.json({ success: true });
}
