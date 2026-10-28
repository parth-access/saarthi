'use client';

/**
 * "Run now" for each scheduled job.
 *
 * The scheduler runs these every five minutes; this is for the moments an
 * operator cannot wait — a client on the phone about a refund or a missing Meet
 * link. Each run goes through `POST /api/admin/jobs/run`, which re-checks the
 * admin role and runs the scheduler's own handler, so a run here can only do
 * what the next tick would have done. Every run is confirmed first; the refund
 * run says plainly that it sends money.
 */
import { CheckCircle2, Loader2, Play, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { RUNNABLE_JOBS, jobRunFigures, type RunnableJob, type RunnableJobId } from '@/domains/admin/backgroundJobRuns';
import { ConfirmDialog } from '../../ConfirmDialog';

type RunOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly text: string };

async function runJob(id: RunnableJobId): Promise<RunOutcome> {
  try {
    const response = await fetchWithAuth('/api/admin/jobs/run', {
      method: 'POST',
      body: JSON.stringify({ job: id }),
    });
    const body = (await response.json().catch(() => null)) as
      | { success?: boolean; error?: string; result?: unknown; durationMs?: number }
      | null;
    if (!response.ok || !body?.success) {
      return { ok: false, text: body?.error ?? `The run failed (HTTP ${response.status}).` };
    }
    const figures = jobRunFigures(body.result);
    const seconds = typeof body.durationMs === 'number' ? ` in ${(body.durationMs / 1000).toFixed(1)}s` : '';
    return {
      ok: true,
      text: figures.length
        ? `Done${seconds}: ${figures.map((figure) => `${figure.value} ${figure.label}`).join(', ')}.`
        : `Done${seconds}.`,
    };
  } catch {
    return {
      ok: false,
      text: 'The request did not complete, so it is not known whether the job ran. Reload before running it again.',
    };
  }
}

export function RunJobsPanel({ onRan }: { onRan?: () => void }) {
  const [confirming, setConfirming] = useState<RunnableJob | null>(null);
  const [running, setRunning] = useState<RunnableJobId | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<RunnableJobId, RunOutcome>>>({});

  async function confirmRun() {
    if (!confirming || running) return;
    const job = confirming;
    setRunning(job.id);
    const outcome = await runJob(job.id);
    setOutcomes((previous) => ({ ...previous, [job.id]: outcome }));
    setRunning(null);
    setConfirming(null);
    onRan?.();
  }

  return (
    <section aria-labelledby="run-jobs-title" className="rounded-xl border border-hairline bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="run-jobs-title" className="font-serif text-primary">
          Run a job now
        </h2>
        <p className="text-xs text-muted-foreground">The scheduler runs each of these every five minutes.</p>
      </div>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {RUNNABLE_JOBS.map((job) => {
          const outcome = outcomes[job.id];
          const isRunning = running === job.id;
          return (
            <li key={job.id} className="flex flex-col rounded-lg border border-hairline p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-primary">{job.label}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-3"
                  disabled={running !== null}
                  onClick={() => setConfirming(job)}
                  aria-label={`Run: ${job.label}`}
                >
                  {isRunning ? (
                    <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {isRunning ? 'Running…' : 'Run'}
                </Button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{job.does}</p>
              {outcome && (
                <p
                  role="status"
                  className={`mt-2 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
                    outcome.ok ? 'bg-success-surface text-success' : 'bg-warning-surface text-warning'
                  }`}
                >
                  {outcome.ok ? (
                    <CheckCircle2 aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{outcome.text}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {confirming && (
        <ConfirmDialog
          title={`Run “${confirming.label}” now?`}
          subtitle={confirming.when}
          busy={running !== null}
          onClose={() => {
            if (!running) setConfirming(null);
          }}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirming(null)} disabled={running !== null}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmRun} disabled={running !== null}>
                {running ? 'Running…' : 'Run now'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-primary/80">{confirming.does}</p>
          {confirming.movesMoney && (
            <p className="mt-2 rounded-md bg-warning-surface px-2.5 py-2 text-xs font-medium text-warning">
              This sends real refunds to Razorpay for every refund that is due. Refunds already sent are skipped.
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
