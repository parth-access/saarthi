import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/app/api/_lib/cronAuth';
import { logger } from '@/app/api/_lib/logger';
import { GET as processOutbox } from '../process-outbox/route';
import { GET as sessionReminders } from '../session-reminders/route';
import { GET as sessionCompletion } from '../session-completion/route';
import { GET as retryCalendar } from '../retry-calendar/route';
import { GET as processRefunds } from '../process-refunds/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Backup scheduler — called once a day by Vercel Cron (vercel.json `crons`).
 *
 * The primary scheduler is GitHub Actions every 5 minutes
 * (.github/workflows/scheduled-jobs.yml). GitHub silently disables scheduled
 * workflows after 60 days without a push; if that happens, this daily run
 * keeps every job moving (all are idempotent, so running alongside GitHub is
 * harmless) and, when GITHUB_KEEPALIVE_TOKEN is set, switches the GitHub
 * schedule back on.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
const JOBS = [
  ['process-outbox', processOutbox],
  ['session-reminders', sessionReminders],
  ['session-completion', sessionCompletion],
  ['retry-calendar', retryCalendar],
  ['process-refunds', processRefunds],
] as const;

async function reenableGithubSchedule(): Promise<string> {
  const token = process.env.GITHUB_KEEPALIVE_TOKEN;
  const repo = process.env.GITHUB_KEEPALIVE_REPO; // e.g. "parth-access/saarthi"
  if (!token || !repo) return 'skipped (GITHUB_KEEPALIVE_TOKEN / GITHUB_KEEPALIVE_REPO not set)';
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/scheduled-jobs.yml/enable`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    return res.status === 204 ? 'enabled' : `github responded ${res.status}`;
  } catch (error) {
    logger.warn('CRON', 'Could not re-enable the GitHub schedule', { error: String(error) });
    return 'failed';
  }
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.authorized) return auth.response!;

  const results: Record<string, { ok: boolean; status: number }> = {};
  // Sequential: the jobs touch overlapping bookings, and the daily run is
  // not latency-sensitive.
  for (const [name, handler] of JOBS) {
    try {
      const res = await handler(req);
      results[name] = { ok: res.ok, status: res.status };
    } catch (error) {
      logger.error('CRON', `Backup run: ${name} threw`, error);
      results[name] = { ok: false, status: 500 };
    }
  }

  const github = await reenableGithubSchedule();
  const allOk = Object.values(results).every((r) => r.ok);
  logger.info('CRON', 'Daily backup scheduler run', { results, github });

  return NextResponse.json(
    { success: allOk, results, githubSchedule: github, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 207 }
  );
}
