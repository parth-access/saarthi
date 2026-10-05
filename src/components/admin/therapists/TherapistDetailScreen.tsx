'use client';

/**
 * One therapist: who they are, whether clients can book them, and the working
 * schedule that decides which start times exist.
 *
 * The schedule is the substance of this page, and the thing it does that no other
 * screen does is show the **bookable grid** — the actual start times a day offers.
 * Those times are not stored anywhere: they are computed here, in the browser, by
 * `buildWeeklySchedule`, which calls the same `generateTimeSlots` the availability
 * endpoint calls. So what an operator reads on this page is what a client would be
 * offered, and the two cannot drift.
 *
 * Three honesty rules shape the layout:
 *
 *  1. **Active status is shown, not toggled.** Flipping it is a write this console
 *     does not own yet (the only existing endpoint also authorizes therapists to
 *     write it, which is not an admin operation), so the status is stated with
 *     where to change it — never as a switch that silently does nothing.
 *  2. **The two halves of the schedule fail independently.** Weekly rules and date
 *     overrides are separate reads; if one fails the other still renders and the
 *     page says which half is missing. A schedule that half-loaded must never read
 *     as a therapist with no hours.
 *  3. **A rule that yields nothing is called out.** An active rule producing no
 *     start times looks set up and books no one — the one state worth interrupting
 *     an operator for.
 *
 * The schedule is editable from here, and every write goes through the admin-only
 * endpoint; `ScheduleEditor` owns the dialogs and the confirmation step. The buttons
 * appear only inside a half that loaded — a failed read means the overlap check has
 * nothing real to check against and the operator cannot see what they are changing,
 * so that panel states the failure and offers nothing to press.
 */
import { useState, useMemo } from 'react';
import { ArrowLeft, CalendarX2, Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import { buildWeeklySchedule, type ScheduledDay } from '@/domains/admin/therapistSchedule';
import { getIstNow } from '@/shared/scheduling/slots';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  formatSessionDayLong,
  toneClasses,
} from '../bookings/adminBookingPresentation';
import { CopyableId } from '../bookings/CopyableId';
import {
  describeActiveStatus,
  describeBreaks,
  describeCadence,
  describeOverride,
  describeWindow,
  readDay,
  weekdayName,
} from './therapistsPresentation';
import type {
  AdminScheduleRule,
  AdminTherapistDetailPayload,
  AdminTherapistIdentity,
  OverrideScan,
  RuleScan,
} from './adminTherapistsResponse';
import { ScheduleEditor, type ScheduleEditIntent } from './ScheduleEditor';
import { useAdminTherapistDetail } from './useAdminTherapists';

export function TherapistDetailScreen({ therapistId }: { therapistId: string }) {
  const { data, loading, initialLoading, error, notFound, reload } =
    useAdminTherapistDetail(therapistId);
  // What the operator clicked. The editor derives the whole dialog from it, and
  // clearing it is what closes the dialog.
  const [intent, setIntent] = useState<ScheduleEditIntent | null>(null);

  if (initialLoading) return <DetailSkeleton />;
  if (notFound) return <NotFound therapistId={therapistId} />;
  if (!data) return <LoadFailed error={error} onRetry={reload} />;

  return (
    <div className="space-y-3">
      <BackLink />
      <Reading payload={data} loading={loading} onReload={reload} />

      {error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error} What you see below was
          read at {formatCreatedAt(data.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}.
        </Notice>
      )}

      {/* Above the panels: an outcome banner reporting a write that has already
          happened must not be somewhere the operator has to scroll to find. */}
      <ScheduleEditor
        therapistId={therapistId}
        intent={intent}
        rules={data.rules.ok ? data.rules.rows : []}
        overrides={data.overrides.ok ? data.overrides.rows : []}
        onClose={() => setIntent(null)}
        onApplied={reload}
      />

      <Identity therapist={data.therapist} />
      <WeeklySchedule rules={data.rules} onEdit={setIntent} />
      <Overrides overrides={data.overrides} onEdit={setIntent} />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/therapists"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      All therapists
    </Link>
  );
}

function Reading({
  payload,
  loading,
  onReload,
}: {
  payload: AdminTherapistDetailPayload;
  loading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{payload.therapist.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Read at {formatCreatedAt(payload.generatedAtIso)} {DISPLAY_TIME_ZONE_LABEL}. All times are{' '}
          {DISPLAY_TIME_ZONE_LABEL}.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reading…' : 'Read again'}
      </Button>
    </div>
  );
}

/**
 * Who this therapist is, and whether clients can book them.
 *
 * The status is deliberately a statement, not a control. The one endpoint that
 * writes `active` today also authorizes a therapist to write it for themselves,
 * which is not an admin-only operation; wiring this console to it would either
 * weaken that route's authorization or present a button that fails. So the state is
 * shown, its consequence is spelled out, and the place it can be changed is named.
 */
function Identity({ therapist }: { therapist: AdminTherapistIdentity }) {
  const status = describeActiveStatus(therapist.active);

  return (
    <Panel title="Therapist">
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{therapist.name}</p>
          <p className="text-xs text-muted-foreground">
            {therapist.specialization ?? 'Specialization not recorded'}
            {therapist.experience ? ` · ${therapist.experience}` : ''}
          </p>
          {therapist.email && <p className="text-xs text-muted-foreground">{therapist.email}</p>}
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[0.6875rem] font-medium ${toneClasses(
            therapist.active ? 'success' : 'neutral'
          )}`}
        >
          {status.label}
        </span>
      </div>

      <p className="mt-2 rounded-lg bg-neutral-surface px-3 py-2 text-[0.6875rem] leading-relaxed text-primary/70">
        {status.detail} This console shows the status but does not change it — that switch lives in the
        current console, under Therapists. Changing it does not touch the schedule below, and changing
        the schedule does not touch it.
      </p>

      {therapist.bio && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{therapist.bio}</p>
      )}

      <div className="mt-2.5 border-t border-hairline pt-2.5">
        <CopyableId id={therapist.id} label="therapist id" />
      </div>
    </Panel>
  );
}

/**
 * The recurring week. `buildWeeklySchedule` runs here so the start times shown are
 * generated by the same function the availability endpoint uses.
 */
function WeeklySchedule({
  rules,
  onEdit,
}: {
  rules: RuleScan;
  onEdit: (intent: ScheduleEditIntent) => void;
}) {
  const week = useMemo<readonly ScheduledDay[]>(
    () => (rules.ok ? buildWeeklySchedule(rules.rows) : []),
    [rules]
  );

  if (!rules.ok) {
    return (
      <Panel title="Weekly schedule">
        <p className="mt-2 text-xs font-medium text-danger">{rules.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is a failed read, not an empty schedule. Do not conclude this therapist has no hours —
          and nothing can be edited from here until it loads, because a new rule would be checked for
          overlaps against hours this page could not see.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Weekly schedule"
      subtitle="The start times below are generated from these rules by the same code the booking page uses, so this is exactly what a client would be offered."
    >
      {rules.unreadable > 0 && (
        <p className="mt-2 rounded-lg bg-warning-surface px-3 py-2 text-[0.6875rem] leading-relaxed text-warning">
          {rules.unreadable} {rules.unreadable === 1 ? 'rule' : 'rules'} could not be placed on a
          weekday and {rules.unreadable === 1 ? 'is' : 'are'} not shown. They are stored but have no
          usable day, so they offer nothing.
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {week.map((day) => (
          <DayRow key={day.dayOfWeek} day={day} onEdit={onEdit} />
        ))}
      </ul>
    </Panel>
  );
}

const DAY_TONE: Record<ReturnType<typeof readDay>['state'], AdminTone> = {
  closed: 'neutral',
  disabled: 'neutral',
  open: 'success',
  problem: 'danger',
};

/** One weekday: its state, the rules behind it, and the grid they produce. */
function DayRow({
  day,
  onEdit,
}: {
  day: ScheduledDay;
  onEdit: (intent: ScheduleEditIntent) => void;
}) {
  const reading = readDay(day);

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium text-primary">{weekdayName(day.dayOfWeek)}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(
              DAY_TONE[reading.state]
            )}`}
          >
            {reading.label}
          </span>
          {/* A day that already has hours can still take a second window — an
              afternoon block after a morning one. The overlap check is what
              decides, not this button. */}
          <RowAction
            icon={Plus}
            label={`Add hours on ${weekdayName(day.dayOfWeek)}`}
            onClick={() => onEdit({ kind: 'new_rule', dayOfWeek: day.dayOfWeek })}
          >
            Add hours
          </RowAction>
        </div>
      </div>
      <p
        className={`mt-1 text-[0.6875rem] leading-relaxed ${
          reading.state === 'problem' ? 'font-medium text-danger' : 'text-muted-foreground'
        }`}
      >
        {reading.detail}
      </p>

      {day.rules.map((rule) => (
        <RuleLine key={rule.id} rule={rule} onEdit={onEdit} />
      ))}

      {day.cadenceNotes.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            This day does not use the standard cadence: {day.cadenceNotes.join(' ')} Nothing is wrong
            with storing it — but it changes how many sessions the day offers.
          </span>
        </p>
      )}

      {day.slots.length > 0 && <SlotGrid slots={day.slots} />}
    </li>
  );
}

/** One stored rule, stated in full — a switched-off rule is shown, never hidden. */
function RuleLine({
  rule,
  onEdit,
}: {
  rule: AdminScheduleRule;
  onEdit: (intent: ScheduleEditIntent) => void;
}) {
  const breaks = describeBreaks(rule.breaks);
  const hours = describeWindow(rule.startTime, rule.endTime);
  return (
    <div className="mt-2 rounded-lg bg-neutral-surface px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium tabular-nums text-primary">{hours}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {!rule.isActive && (
            <span className="rounded bg-white px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
              Switched off
            </span>
          )}
          <RowAction
            icon={Pencil}
            label={`Change the ${hours} hours on ${weekdayName(rule.dayOfWeek)}`}
            onClick={() => onEdit({ kind: 'edit_rule', rule })}
          >
            Change
          </RowAction>
          <RowAction
            icon={Trash2}
            tone="danger"
            label={`Remove the ${hours} hours on ${weekdayName(rule.dayOfWeek)}`}
            onClick={() => onEdit({ kind: 'delete_rule', rule })}
          >
            Remove
          </RowAction>
        </div>
      </div>
      <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
        {describeCadence(rule.slotDuration, rule.cooldownGap)}
        {breaks ? ` · ${breaks}` : ''}
      </p>
    </div>
  );
}

/**
 * The row-level buttons that open the editor.
 *
 * `label` is the accessible name and carries the row's identity — "Remove" alone
 * repeated down a page of rules names nothing, and a screen reader hears the same
 * word six times with no way to tell which window it removes. The visible text
 * stays short because the row it sits in already says which one it is.
 *
 * These only ever open a dialog. Nothing here writes, and nothing here is the
 * confirmation step — `ScheduleEditor` owns both.
 */
function RowAction({
  icon: Icon,
  label,
  tone = 'default',
  onClick,
  children,
}: {
  icon: typeof Pencil;
  label: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        tone === 'danger'
          ? 'text-muted-foreground hover:bg-danger-surface hover:text-danger'
          : 'text-primary/70 hover:bg-primary/5 hover:text-primary'
      }`}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {children}
    </button>
  );
}

/**
 * The start times themselves. Shown in full rather than summarised as a count: the
 * question an operator actually has is "can someone book 4 PM on a Tuesday", and a
 * count cannot answer it.
 */
function SlotGrid({ slots }: { slots: readonly string[] }) {
  return (
    <div className="mt-2.5 border-t border-hairline pt-2.5">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Bookable start times
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {slots.map((slot) => (
          <span
            key={slot}
            className="rounded bg-primary/5 px-1.5 py-0.5 font-mono text-[0.625rem] tabular-nums text-primary"
          >
            {slot}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Date overrides. Sorted by date, soonest first, because the operational question
 * is what is coming — but past ones are kept, since a closed day last week explains
 * a gap someone is asking about today.
 */
function Overrides({
  overrides,
  onEdit,
}: {
  overrides: OverrideScan;
  onEdit: (intent: ScheduleEditIntent) => void;
}) {
  const rows = useMemo(
    () => (overrides.ok ? [...overrides.rows].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [overrides]
  );

  if (!overrides.ok) {
    return (
      <Panel title="Date overrides">
        <p className="mt-2 text-xs font-medium text-danger">{overrides.reason}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This is a failed read. There may be closed days the weekly schedule above does not show —
          and nothing can be added from here until it loads, because a new exception would be checked
          against dates this page could not see.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Date overrides"
      subtitle="Exceptions to the week above, for one date each. A closed date offers nothing whatever the weekly rules say; a replacement date ignores them and uses its own hours."
      action={
        <RowAction
          icon={Plus}
          label="Add a date exception"
          // Today, because the case that brings an operator here in a hurry is a
          // therapist who cannot work today. The date is the first field in the
          // dialog and is editable.
          onClick={() => onEdit({ kind: 'new_override', date: getIstNow().date })}
        >
          Add an exception
        </RowAction>
      }
    >
      {overrides.unreadable > 0 && (
        <p className="mt-2 rounded-lg bg-warning-surface px-3 py-2 text-[0.6875rem] leading-relaxed text-warning">
          {overrides.unreadable} stored {overrides.unreadable === 1 ? 'override has' : 'overrides have'}{' '}
          no usable date and {overrides.unreadable === 1 ? 'is' : 'are'} not shown.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No overrides are stored. Every date follows the weekly schedule above.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-hairline bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-primary">{formatSessionDayLong(row.date)}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(
                      row.type === 'blocked' ? 'warning' : 'info'
                    )}`}
                  >
                    {row.type === 'blocked' ? 'Closed' : 'Replacement hours'}
                  </span>
                  <RowAction
                    icon={Pencil}
                    label={`Change the exception for ${formatSessionDayLong(row.date)}`}
                    onClick={() => onEdit({ kind: 'edit_override', override: row })}
                  >
                    Change
                  </RowAction>
                  <RowAction
                    icon={Trash2}
                    tone="danger"
                    label={`Remove the exception for ${formatSessionDayLong(row.date)}`}
                    onClick={() => onEdit({ kind: 'delete_override', override: row })}
                  >
                    Remove
                  </RowAction>
                </div>
              </div>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                {describeOverride(row)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* h3: the shell owns the page's h1, and this page has no h2 of its own. */}
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
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

/**
 * An id that matches no therapist. Deliberately offers no retry: the read
 * succeeded, and repeating it will return the same answer. The way out is the
 * roster, so that is the only thing offered.
 */
function NotFound({ therapistId }: { therapistId: string }) {
  return (
    <div className="space-y-3">
      <BackLink />
      <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
        <CalendarX2 aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 font-medium text-primary">No therapist with this id</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          Nothing is stored under <span className="font-mono text-[0.6875rem]">{therapistId}</span>.
          The read worked — there is no document to show, so there is nothing to retry.
        </p>
      </div>
    </div>
  );
}

function LoadFailed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <BackLink />
      <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
        <p className="font-medium text-primary">This therapist could not be loaded</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          {error ?? 'The read did not complete.'} Nothing is shown rather than part of it: a partial
          schedule would read as though the missing hours did not exist.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading therapist…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-96 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
