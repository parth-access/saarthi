'use client';

/**
 * The therapist roster: who is on the books, who is switched off, and who has
 * hours that will not produce a bookable slot.
 *
 * This list exists to answer one question at a glance — *is this therapist
 * actually bookable right now?* — which is not the same as whether they are
 * marked active. A therapist can be accepting bookings and have no working days;
 * they can have working days whose rules are all switched off; their schedule read
 * can fail outright. Each of those is a different problem with a different fix, so
 * the roster distinguishes them rather than showing one "0 slots" for all three.
 *
 * Every therapist is listed, active and inactive. The roster is where an operator
 * sees who has been taken off the booking page, so filtering the inactive ones out
 * would hide exactly what they came to check.
 */
import { Plus, RotateCcw, Stethoscope, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TherapistProfileDialog, EMPTY_PROFILE } from './TherapistProfileDialog';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { DISPLAY_TIME_ZONE_LABEL, formatCreatedAt, toneClasses } from '../bookings/adminBookingPresentation';
import { describeActiveStatus, summarizeForRoster } from './therapistsPresentation';
import type {
  AdminTherapistRosterRow,
  AdminTherapistRosterScan,
  AdminTherapistsPayload,
} from './adminTherapistsResponse';
import { useAdminTherapists } from './useAdminTherapists';

export function TherapistsScreen() {
  const { data, loading, initialLoading, error, reload } = useAdminTherapists();

  if (initialLoading) return <RosterSkeleton />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  return (
    <div className="space-y-3">
      <Reading payload={data} loading={loading} onReload={reload} />

      {error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error} What you see below was
          read at {formatCreatedAt(data.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}.
        </Notice>
      )}

      <DrivenBy />
      <Roster scan={data.roster} />
    </div>
  );
}

function Reading({
  payload,
  loading,
  onReload,
}: {
  payload: AdminTherapistsPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Therapists</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Read at {formatCreatedAt(payload.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}. This page does
          not refresh on its own.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AddTherapistButton />
        <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
          <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Reading…' : 'Read again'}
        </Button>
      </div>
    </div>
  );
}

/**
 * What this section is and is not, said once. The bookability switch itself
 * lives on each therapist's detail page, where its consequences can be read
 * before it is flipped; the roster states the state and the schedule gap.
 */
function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">Every therapist is listed, active or not.</span>{' '}
      &ldquo;Working days&rdquo; counts only days whose rules are switched on and actually produce
      bookable start times — so a therapist who is accepting bookings can still show none. Open a
      therapist to edit their schedule or change whether clients can book them at all.
    </p>
  );
}

function Roster({ scan }: { scan: AdminTherapistRosterScan }) {
  if (!scan.ok) {
    return (
      <Panel title="Roster">
        <p className="mt-2 text-xs font-medium text-danger">{scan.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is missing, not empty. Do not read it as no therapists.
        </p>
      </Panel>
    );
  }

  if (scan.rows.length === 0) {
    return (
      <Panel title="Roster">
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          No therapist documents exist. The booking page has no one to offer until one is created.
        </p>
      </Panel>
    );
  }

  return <RosterList rows={scan.rows} />;
}

/** Archived therapists are hidden unless asked for — they are no longer on the books. */
function RosterList({ rows }: { rows: readonly AdminTherapistRosterRow[] }) {
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = rows.filter((r) => r.archived).length;
  const visible = showArchived ? rows : rows.filter((r) => !r.archived);
  const current = rows.length - archivedCount;

  return (
    <Panel
      title="Roster"
      subtitle={`${current} ${current === 1 ? 'therapist' : 'therapists'}, by name${archivedCount ? ` · ${archivedCount} archived` : ''}.`}
    >
      {archivedCount > 0 && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived therapists
        </label>
      )}
      {visible.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Every therapist is archived. Use “Add therapist” to add one.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {visible.map((row) => (
            <RosterCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * One therapist. The schedule line is the operational content: it says how many
 * days genuinely work, and carries a warning when the schedule needs a person —
 * no working days, a cadence that has drifted, or a read that failed.
 */
function RosterCard({ row }: { row: AdminTherapistRosterRow }) {
  const status = describeActiveStatus(row.active);
  const schedule = summarizeForRoster(row.summary);

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Stethoscope aria-hidden="true" className="h-4 w-4 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">
              {row.name}
              {row.archived && (
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses('neutral')}`}>
                  Archived
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.specialization ?? 'Specialization not recorded'}
            </p>
            {row.email && <p className="truncate text-[0.625rem] text-muted-foreground">{row.email}</p>}
          </div>
        </div>
        <span
          title={status.detail}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(
            row.active ? 'success' : 'neutral'
          )}`}
        >
          {status.label}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{schedule.text}</p>
      {schedule.warning && (
        <p className="mt-1 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
          {schedule.warning}
        </p>
      )}

      <div className="mt-2.5 border-t border-hairline pt-2.5">
        <Link
          href={`/admin/therapists/${encodeURIComponent(row.id)}`}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open schedule
        </Link>
      </div>
    </li>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      {/* h3: the shell owns the page's h1, and this page has no h2 of its own. */}
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

function Notice({ tone, children }: { tone: AdminTone; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-xl px-4 py-2.5 text-xs leading-relaxed ${toneClasses(tone)}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

function LoadFailed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-medium text-primary">Therapists could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a partial
        roster would read as though the rest were fine.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function RosterSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading therapists…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-12 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-64 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}

/** Opens the profile form; on success goes straight to the new therapist's page
 *  so the operator can add their schedule and switch bookability on. */
function AddTherapistButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Add therapist
      </Button>
      {open && (
        <TherapistProfileDialog
          mode="create"
          initial={EMPTY_PROFILE}
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false);
            router.push(`/admin/therapists/${encodeURIComponent(id)}`);
          }}
        />
      )}
    </>
  );
}
