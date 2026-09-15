import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession } from '@/lib/auth/verifySession';
import { TherapistPostSessionService, type FollowUpStatus } from '@/services/therapistPostSessionService';
import { logger } from '../../_lib/logger';
import { checkRateLimit } from '../../_lib/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    bookingId: z.string().min(1),
    followUpStatus: z.enum(['recommended', 'scheduled', 'deferred', 'none']),
  })
  .strict();

/**
 * Therapist follow-up decision API.
 *
 * Records the therapist's scheduling/continuity decision after a completed
 * session: 'recommended' | 'scheduled' | 'deferred' | 'none'. This is NOT a
 * clinical conclusion — 'none' simply means no follow-up is planned.
 *
 * Authorization: owning therapist or admin (verified server-side in the service).
 */
export async function POST(req: Request) {
  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(clientIp, 'follow_up_set', 30, 60_000);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    const session = await verifySession(req);
    if (!session?.uid) {
      return NextResponse.json({ success: false, error: 'Please sign in.' }, { status: 401 });
    }
    if (session.role !== 'therapist' && session.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Only therapists can set follow-up decisions.' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { bookingId, followUpStatus } = parsed.data as { bookingId: string; followUpStatus: FollowUpStatus };

    const result = await TherapistPostSessionService.setFollowUpStatus(
      { bookingId, followUpStatus },
      { uid: session.uid, role: session.role || 'therapist' }
    );

    if (!result.success) {
      const status = result.error?.startsWith('Unauthorized') ? 403 : 400;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    return NextResponse.json({ success: true, alreadyInTargetStatus: result.alreadyInTargetStatus });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('FOLLOW_UP_API', 'Failed to process follow-up decision', { error: errorMsg });
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
