import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { readTherapistRoster } from './therapistSources';
import { logger } from '../../_lib/logger';

export const dynamic = 'force-dynamic';

/**
 * The therapist roster: who is on the books, and who is switched off.
 *
 * Lists every therapist, active and inactive, with a glance-level schedule
 * summary (how many days they work, whether any rule has drifted from the
 * 45-minute cadence). The detail page carries the full weekly schedule and the
 * editing affordances; this is the way in.
 *
 * Read-only, and `requireAdmin`-guarded with live role verification. A Firestore
 * error is logged server-side and the browser gets fixed copy, so an index URL
 * or project id in an error message is never rendered.
 */
export async function GET(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  try {
    const roster = await readTherapistRoster();
    return NextResponse.json(
      { success: true, generatedAtIso: new Date().toISOString(), roster },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('THERAPIST_MUTATION', 'Admin therapist roster failed to assemble', error);
    return NextResponse.json(
      { success: false, error: 'We could not load therapists right now. Please try again.' },
      { status: 500 }
    );
  }
}
