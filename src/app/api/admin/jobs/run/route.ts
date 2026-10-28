import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireRole';
import { isRunnableJobId, type RunnableJobId } from '@/domains/admin/backgroundJobRuns';
import { logger } from '../../../_lib/logger';
import { checkRateLimit, getClientIp } from '../../../_lib/rateLimit';
import { GET as processOutbox } from '../../../cron/process-outbox/route';
import { GET as sessionReminders } from '../../../cron/session-reminders/route';
import { GET as sessionCompletion } from '../../../cron/session-completion/route';
import { GET as retryCalendar } from '../../../cron/retry-calendar/route';
import { GET as processRefunds } from '../../../cron/process-refunds/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HANDLERS: Record<RunnableJobId, (req: Request) => Promise<Response>> = {
  'process-outbox': processOutbox,
  'session-reminders': sessionReminders,
  'session-completion': sessionCompletion,
  'retry-calendar': retryCalendar,
  'process-refunds': processRefunds,
};

/**
 * Run one scheduled job now, for an admin.
 *
 * The cron routes accept only `Bearer ${CRON_SECRET}`, a secret no browser
 * holds. This route is the admin's door to them: it verifies the session and
 * the live admin role first, then calls the job's own handler in-process with
 * a request it builds itself. The secret never leaves the server, the job id is
 * an allow-list, and the handler runs exactly the code the scheduler runs —
 * nothing here re-implements a job.
 */
export async function POST(req: Request) {
  const authorized = await requireAdmin(req);
  if (authorized instanceof NextResponse) return authorized;

  // A job does real work (and, for refunds, moves money): a stuck button or a
  // script should not be able to hammer it.
  const limit = checkRateLimit(getClientIp(req), 'admin_run_job', 6, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { success: false, error: 'Too many runs in a short time. Wait a minute and try again.' },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as { job?: unknown } | null;
  const job = body?.job;
  if (!isRunnableJobId(job)) {
    return NextResponse.json({ success: false, error: 'That is not a job this console can run.' }, { status: 400 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === '') {
    logger.error('CRON', 'Admin job run refused: CRON_SECRET is not configured', { job });
    return NextResponse.json(
      { success: false, error: 'The job runner is not configured on this deployment (CRON_SECRET is missing).' },
      { status: 503 }
    );
  }

  const internal = new Request(new URL(`/api/cron/${job}`, req.url), {
    method: 'GET',
    headers: { authorization: `Bearer ${secret}` },
  });

  const startedAt = Date.now();
  try {
    const response = await HANDLERS[job](internal);
    const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const durationMs = Date.now() - startedAt;

    logger.info('CRON', 'Admin ran a background job', {
      job,
      adminUid: authorized.uid,
      status: response.status,
      durationMs,
    });

    return NextResponse.json(
      {
        success: response.ok,
        job,
        status: response.status,
        durationMs,
        result,
        ranAtIso: new Date(startedAt).toISOString(),
        ...(response.ok ? {} : { error: typeof result?.error === 'string' ? result.error : 'The job reported a failure.' }),
      },
      { status: response.ok ? 200 : 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    logger.error('CRON', 'Admin job run threw', error, { job, adminUid: authorized.uid });
    return NextResponse.json({ success: false, job, error: 'The job could not be run. Try again.' }, { status: 500 });
  }
}
