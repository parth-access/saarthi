import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/lib/auth/verifySession';
import { TherapistPostSessionService } from '@/services/therapistPostSessionService';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';

export const dynamic = 'force-dynamic';

const saveSchema = z
  .object({
    bookingId: z.string().min(1),
    privateNotes: z.string().max(20_000).optional(),
    clientSummary: z.string().max(10_000).optional(),
    shareSummaryWithClient: z.boolean().optional(),
  })
  .strict();

/**
 * Therapist post-session notes API.
 *
 * - POST: create/update private notes and/or the client-facing summary
 *   (sharing is an explicit opt-in flag — summaries are never auto-shared).
 * - GET:  therapist-only view of the full note document (private notes included).
 *
 * Authorization is enforced server-side inside the service: only the therapist
 * who owns the booking (matched via the `therapists` collection authId/id) or an
 * admin may read or write. Clients must use /api/bookings/[bookingId]/summary.
 */
export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'session_notes_save', 30, 60_000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const session = await verifySession(req);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Please sign in to save session notes.' }, { status: 401 });
    }
    if (session.role !== 'therapist' && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only therapists can save session notes.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await TherapistPostSessionService.saveSessionNotes(parsed.data, {
      uid: session.uid,
      role: session.role || 'therapist',
    });

    if (!result.success) {
      const status = result.error?.startsWith('Unauthorized') ? 403 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({ success: true, alreadyExisted: result.alreadyExisted });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('SESSION_NOTES_API', 'Failed to process POST session notes', { error: errorMsg });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await verifySession(req);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
    }
    if (session.role !== 'therapist' && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only therapists can view session notes.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('bookingId');
    if (!bookingId) {
      return NextResponse.json({ success: false, error: 'bookingId is required' }, { status: 400 });
    }

    const result = await TherapistPostSessionService.getSessionNotes(bookingId, {
      uid: session.uid,
      role: session.role || 'therapist',
    });

    if (!result.success) {
      const status = result.error?.startsWith('Unauthorized') ? 403 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({ success: true, notes: result.notes ?? null });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('SESSION_NOTES_API', 'Failed to process GET session notes', { error: errorMsg });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
