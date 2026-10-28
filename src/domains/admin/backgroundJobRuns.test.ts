import { describe, expect, it } from 'vitest';
import { RUNNABLE_JOBS, RUNNABLE_JOB_IDS, isRunnableJobId, jobRunFigures } from './backgroundJobRuns';

describe('runnable jobs', () => {
  it('describes every allow-listed job exactly once', () => {
    expect(RUNNABLE_JOBS.map((job) => job.id).sort()).toEqual([...RUNNABLE_JOB_IDS].sort());
  });

  it('flags only the refund run as moving money', () => {
    expect(RUNNABLE_JOBS.filter((job) => job.movesMoney).map((job) => job.id)).toEqual(['process-refunds']);
  });

  it('accepts only allow-listed ids', () => {
    expect(isRunnableJobId('process-outbox')).toBe(true);
    expect(isRunnableJobId('all')).toBe(false);
    expect(isRunnableJobId(undefined)).toBe(false);
  });
});

describe('jobRunFigures', () => {
  it('labels numeric counts and ignores everything else', () => {
    expect(
      jobRunFigures({ success: true, scanned: 4, stillPending: 1, timestamp: 'x', newThing: 2, nested: { a: 1 } })
    ).toEqual([
      { label: 'checked', value: 4 },
      { label: 'still pending', value: 1 },
      { label: 'new thing', value: 2 },
    ]);
  });

  it('reads nothing from a missing body', () => {
    expect(jobRunFigures(null)).toEqual([]);
  });
});
