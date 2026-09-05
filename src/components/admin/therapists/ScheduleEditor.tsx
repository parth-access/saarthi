'use client';

/**
 * Changing a therapist's working schedule from the admin console.
 *
 * This is the only surface in the app that writes another person's hours, so it is
 * built around four properties rather than around convenience:
 *
 *  1. **The draft is checked before it is sent, by the server's own checks.**
 *     `checkRuleForm` / `checkOverrideForm` run `checkRuleDraft` /
 *     `checkOverrideDraft` — the same functions the endpoint runs — against the same
 *     stored rows. So a refusal is shown before a request is made, in the server's
 *     own words. None of it is a security boundary: the endpoint re-checks inside
 *     its transaction, and would refuse the same thing if this file were deleted.
 *  2. **Consequences are seen before they happen.** A change that would strand a
 *     booking, or leave a therapist with no schedule at all, comes back from the
 *     endpoint as `applied: false` with the list. The operator confirms against that
 *     list; the endpoint recomputes it on the confirming request, so a booking made
 *     in between is counted. No booking is ever modified — a stranded session stays
 *     exactly as it is, for a person to move.
 *  3. **The start times a draft would produce are shown while it is being typed.**
 *     From `generateTimeSlots`, the function the booking page calls. "09:00 to
 *     17:00, 45-minute sessions" does not tell an operator the last bookable start
 *     is 15:45; the grid does.
 *  4. **Editing is offered only for a half of the schedule that loaded.** If the
 *     rules read failed, the existing rules are unknown — so the overlap check has
 *     nothing to check against and the operator cannot see what they are changing.
 *     The buttons are withheld and the reason is stated.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import type { AdminScheduleOverride, AdminScheduleRule } from '@/domains/admin/therapistSchedule';
import { MAX_COOLDOWN_MINUTES } from '@/domains/admin/therapistScheduleWrite';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatSessionDay,
  formatSessionDayLong,
  humanizeStatus,
} from '../bookings/adminBookingPresentation';
import { describeWindow, weekdayName } from './therapistsPresentation';
import {
  SLOT_CHOICES,
  blankOverrideForm,
  blankRuleForm,
  checkOverrideForm,
  checkRuleForm,
  formCadenceWarning,
  overrideFormFrom,
  previewSlots,
  ruleFormFrom,
  ruleFormIsUnchanged,
  type BreakFormState,
  type OverrideFormState,
  type RuleFormState,
} from './scheduleEditorForm';
import type { ScheduleWriteRequest, StrandedRow, WriteImpact } from './scheduleWriteResponse';
import { useAdminScheduleWrite } from './useAdminScheduleWrite';

/** What the operator clicked. The editor derives everything else from this. */
export type ScheduleEditIntent =
  | { readonly kind: 'new_rule'; readonly dayOfWeek: number }
  | { readonly kind: 'edit_rule'; readonly rule: AdminScheduleRule }
  | { readonly kind: 'delete_rule'; readonly rule: AdminScheduleRule }
  | { readonly kind: 'new_override'; readonly date: string }
  | { readonly kind: 'edit_override'; readonly override: AdminScheduleOverride }
  | { readonly kind: 'delete_override'; readonly override: AdminScheduleOverride };

interface Pending {
  readonly request: ScheduleWriteRequest;
  readonly impact: WriteImpact;
  readonly notes: readonly string[];
  readonly warnings: readonly string[];
}

type Outcome =
  | {
      readonly tone: 'applied';
      readonly summary: string;
      readonly notes: readonly string[];
      readonly warnings: readonly string[];
    }
  | { readonly tone: 'unknown'; readonly error: string };

const FIELD =
  'rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

export function ScheduleEditor({
  therapistId,
  intent,
  rules,
  overrides,
  onClose,
  onApplied,
}: {
  therapistId: string;
  /** Null when nothing is being edited. A new value opens a fresh dialog. */
  intent: ScheduleEditIntent | null;
  /** Every stored rule, which is what makes the overlap check real. */
  rules: readonly AdminScheduleRule[];
  overrides: readonly AdminScheduleOverride[];
  onClose: () => void;
  /** Refetches the therapist. Called after any answer that may have changed state. */
  onApplied: () => void;
}) {
  const { submitting, send } = useAdminScheduleWrite(therapistId);
  const [ruleForm, setRuleForm] = useState<RuleFormState | null>(null);
  const [overrideForm, setOverrideForm] = useState<OverrideFormState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // A new intent is a fresh dialog. Closing is deliberately *not* a reset: the
  // outcome banner has to outlive the dialog that produced it.
  useEffect(() => {
    if (!intent) return;
    setProblem(null);
    setPending(null);
    setOutcome(null);
    setRuleForm(
      intent.kind === 'new_rule'
        ? blankRuleForm(intent.dayOfWeek)
        : intent.kind === 'edit_rule'
          ? ruleFormFrom(intent.rule)
          : null
    );
    setOverrideForm(
      intent.kind === 'new_override'
        ? blankOverrideForm(intent.date)
        : intent.kind === 'edit_override'
          ? overrideFormFrom(intent.override)
          : null
    );
  }, [intent]);

  const buildRequest = useCallback(():
    | { ok: true; request: ScheduleWriteRequest }
    | { ok: false; problem: string } => {
    if (!intent) return { ok: false, problem: 'Nothing is being edited.' };
    switch (intent.kind) {
      case 'delete_rule':
        return { ok: true, request: { action: 'delete_rule', ruleId: intent.rule.id } };
      case 'delete_override':
        return { ok: true, request: { action: 'delete_override', overrideId: intent.override.id } };
      case 'new_rule':
      case 'edit_rule': {
        if (!ruleForm) return { ok: false, problem: 'Nothing is being edited.' };
        const check = checkRuleForm(ruleForm, rules);
        if (!check.ok) return { ok: false, problem: check.problem };
        return { ok: true, request: { action: 'save_rule', ruleId: ruleForm.ruleId, rule: check.draft } };
      }
      case 'new_override':
      case 'edit_override': {
        if (!overrideForm) return { ok: false, problem: 'Nothing is being edited.' };
        const check = checkOverrideForm(overrideForm, overrides);
        if (!check.ok) return { ok: false, problem: check.problem };
        return {
          ok: true,
          request: { action: 'save_override', overrideId: overrideForm.overrideId, override: check.draft },
        };
      }
    }
  }, [intent, overrideForm, overrides, ruleForm, rules]);

  const receive = useCallback(
    (request: ScheduleWriteRequest, result: Awaited<ReturnType<typeof send>>) => {
      if (result.kind === 'confirm') {
        // Nothing was written. Show what the change would do and ask.
        setProblem(null);
        setPending({ request, impact: result.impact, notes: result.notes, warnings: result.warnings });
        return;
      }
      if (result.kind === 'applied') {
        setOutcome({
          tone: 'applied',
          summary: result.summary,
          notes: result.notes,
          warnings: result.warnings,
        });
        setPending(null);
        onClose();
        onApplied();
        return;
      }
      if (result.kind === 'unknown') {
        // The dialog closes so the only offered next step is a reload. Leaving a
        // live submit button beside an indeterminate outcome invites the retry.
        setOutcome({ tone: 'unknown', error: result.error });
        setPending(null);
        onClose();
        return;
      }
      // Refused, with the server's reason. The dialog stays open and the draft
      // stays as typed, because the next move is usually to change one field.
      setProblem(result.error);
    },
    [onApplied, onClose]
  );

  const submit = useCallback(async () => {
    if (submitting) return;
    const built = buildRequest();
    if (!built.ok) {
      setProblem(built.problem);
      return;
    }
    setProblem(null);
    receive(built.request, await send(built.request));
  }, [buildRequest, receive, send, submitting]);

  const confirmPending = useCallback(async () => {
    if (!pending || submitting) return;
    // The endpoint recomputes the impact on this request rather than trusting the
    // first, so this is not a replay of a stale decision.
    const request = { ...pending.request, acknowledgeImpact: true };
    setProblem(null);
    receive(request, await send(request));
  }, [pending, receive, send, submitting]);

  const heading = intent ? headingFor(intent) : '';

  return (
    <>
      {outcome && <OutcomeBanner outcome={outcome} onReload={onApplied} />}

      {intent && pending && (
        <ImpactDialog
          heading={heading}
          pending={pending}
          busy={submitting}
          problem={problem}
          onClose={onClose}
          onConfirm={confirmPending}
        />
      )}

      {intent && !pending && (intent.kind === 'delete_rule' || intent.kind === 'delete_override') && (
        <RemovalDialog
          intent={intent}
          busy={submitting}
          problem={problem}
          onClose={onClose}
          onSubmit={submit}
        />
      )}

      {/* Gated on the intent kind as well as the form, so which dialog is open is
          decided by what was clicked and not by whether the effect that clears the
          other form has committed yet. Two stacked modals is not a state to leave
          reachable, however briefly. */}
      {intent && !pending && ruleForm && (intent.kind === 'new_rule' || intent.kind === 'edit_rule') && (
        <RuleDialog
          heading={heading}
          form={ruleForm}
          setForm={setRuleForm as React.Dispatch<React.SetStateAction<RuleFormState>>}
          original={intent.kind === 'edit_rule' ? intent.rule : null}
          busy={submitting}
          problem={problem}
          onClose={onClose}
          onSubmit={submit}
        />
      )}

      {intent &&
        !pending &&
        overrideForm &&
        (intent.kind === 'new_override' || intent.kind === 'edit_override') && (
          <OverrideDialog
            heading={heading}
            form={overrideForm}
            setForm={setOverrideForm as React.Dispatch<React.SetStateAction<OverrideFormState>>}
            busy={submitting}
            problem={problem}
            onClose={onClose}
            onSubmit={submit}
          />
        )}
    </>
  );
}

function headingFor(intent: ScheduleEditIntent): string {
  switch (intent.kind) {
    case 'new_rule':
      return `Add working hours on ${weekdayName(intent.dayOfWeek)}`;
    case 'edit_rule':
      return `${weekdayName(intent.rule.dayOfWeek)} ${describeWindow(intent.rule.startTime, intent.rule.endTime)}`;
    case 'delete_rule':
      return `Remove ${weekdayName(intent.rule.dayOfWeek)} ${describeWindow(intent.rule.startTime, intent.rule.endTime)}`;
    case 'new_override':
      return 'Add a date exception';
    case 'edit_override':
      return `Date exception for ${formatSessionDayLong(intent.override.date)}`;
    case 'delete_override':
      return `Remove the exception for ${formatSessionDayLong(intent.override.date)}`;
  }
}

/**
 * What the server said happened, or that it is not known.
 *
 * The unknown case is styled as a warning and offers only a reload — never a retry,
 * which is the one action that could apply a schedule change twice.
 */
function OutcomeBanner({ outcome, onReload }: { outcome: Outcome; onReload: () => void }) {
  if (outcome.tone === 'unknown') {
    return (
      <div
        role="alert"
        className="rounded-xl bg-warning-surface px-4 py-3 text-xs leading-relaxed text-warning"
      >
        <span className="flex items-start gap-2">
          <AlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          <span className="min-w-0">{outcome.error}</span>
        </span>
        <Button variant="outline" size="sm" className="mt-2" onClick={onReload}>
          <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Reload this therapist
        </Button>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-xl bg-success-surface px-4 py-3 text-xs leading-relaxed text-success">
      <span className="flex items-start gap-2">
        <Check aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="font-medium">{outcome.summary}</span>
          <Lines lines={[...outcome.notes, ...outcome.warnings]} />
        </span>
      </span>
    </div>
  );
}

function Lines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-4">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** The server's own refusal sentence, in place, with the draft left as typed. */
function Problem({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-lg bg-danger-surface px-3 py-2 text-xs leading-relaxed text-danger"
    >
      {text}
    </p>
  );
}

/**
 * The confirmation step, shown when the endpoint answered `applied: false`.
 *
 * Nothing has been written at this point. `notes` are the server's own sentences
 * about what the change means; the list underneath is the part a count cannot
 * replace — which sessions, whose, and when. That no booking is touched either way
 * is stated here rather than left to be inferred: an operator who believes
 * confirming cancels sessions will refuse a safe change.
 */
function ImpactDialog({
  heading,
  pending,
  busy,
  problem,
  onClose,
  onConfirm,
}: {
  heading: string;
  pending: Pending;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { impact, notes, warnings } = pending;
  const stranding = impact.stranded.length > 0 || impact.losesAllConfiguration;

  return (
    <ConfirmDialog
      title="Nothing has been stored yet"
      subtitle={heading}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Leave the schedule as it is
          </Button>
          <Button
            type="button"
            size="sm"
            variant={stranding ? 'destructive' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Working…' : 'Store this change'}
          </Button>
        </>
      }
    >
      {notes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary">What this will do</p>
          <ul className="mt-1.5 space-y-1.5">
            {notes.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-xs leading-relaxed text-primary/80"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/40"
                />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {impact.stranded.length > 0 && <StrandedList stranded={impact.stranded} />}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg bg-warning-surface px-3 py-2 text-xs leading-relaxed text-warning">
          <span className="flex items-start gap-2">
            <TriangleAlert aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
            <span className="min-w-0">
              {warnings.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </span>
        </div>
      )}

      {problem && <Problem text={problem} />}
    </ConfirmDialog>
  );
}

const STRANDED_SHOWN = 12;

/**
 * Which sessions the change would leave outside the therapist's hours.
 *
 * The count and the "nothing is cancelled" sentence are already in the notes above;
 * this is the part a count cannot replace — the date, the time, whose session it is
 * and what state it is in, which is what an operator needs to go and move them.
 *
 * Long lists are cut for reading and the cut is stated. A list silently truncated
 * at twelve reads as "twelve affected" when it was ninety, and the operator would
 * then confirm against a number they were never shown.
 */
function StrandedList({ stranded }: { stranded: readonly StrandedRow[] }) {
  const shown = stranded.slice(0, STRANDED_SHOWN);
  const hidden = stranded.length - shown.length;

  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <p className="text-xs font-medium text-primary">
        Sessions that would fall outside the new hours
      </p>
      <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
        Every one of these is recorded on the audit entry for this change, so the list is
        recoverable after the dialog closes.
      </p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-relaxed text-primary"
          >
            <span className="tabular font-medium">
              {formatSessionDay(row.date)} {row.time} {DISPLAY_TIME_ZONE_LABEL}
            </span>
            <span className="text-primary/80">{row.clientName || 'Client name not recorded'}</span>
            <span className="text-muted-foreground">{humanizeStatus(row.status)}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
          …and {hidden} more not listed here. All {stranded.length} are in the audit entry.
        </p>
      )}
    </div>
  );
}

/**
 * Removing a rule or a date exception.
 *
 * Says what the schedule looks like afterwards, which for a removal is the part
 * that is easy to get wrong: deleting an exception does not close a date, it hands
 * the date back to the weekly rules — the opposite of what "delete" suggests when
 * the exception was the thing closing it.
 */
function RemovalDialog({
  intent,
  busy,
  problem,
  onClose,
  onSubmit,
}: {
  intent: Extract<ScheduleEditIntent, { kind: 'delete_rule' } | { kind: 'delete_override' }>;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const lines =
    intent.kind === 'delete_rule'
      ? [
          `${weekdayName(intent.rule.dayOfWeek)} ${describeWindow(intent.rule.startTime, intent.rule.endTime)} stops being offered to clients.`,
          'Any other rule on that weekday keeps its own hours. If this was the only one, the day closes.',
        ]
      : [
          `${formatSessionDayLong(intent.override.date)} goes back to whatever the weekly rules say for that weekday.`,
          intent.override.type === 'blocked'
            ? 'This exception is what currently closes that date, so removing it makes the date bookable again.'
            : 'That date currently uses this exception’s own hours instead of the weekly ones.',
        ];

  return (
    <ConfirmDialog
      title={headingFor(intent)}
      subtitle="Removing this changes what clients can book"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onSubmit} disabled={busy}>
            {busy && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Working…' : intent.kind === 'delete_rule' ? 'Remove these hours' : 'Remove this exception'}
          </Button>
        </>
      }
    >
      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-primary/80">
            <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/40" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
        Existing bookings are never cancelled or moved by a schedule change. If any session would be
        left outside the therapist&apos;s hours, it is listed for you before anything is stored.
      </p>
      {problem && <Problem text={problem} />}
    </ConfirmDialog>
  );
}

const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6];

/** The subset of both forms the shared hour fields read. */
interface HoursShape {
  readonly startTime: string;
  readonly endTime: string;
  readonly slotDuration: string;
  readonly cooldownGap: string;
  readonly breaks: readonly BreakFormState[];
}

interface HoursPatch {
  startTime?: string;
  endTime?: string;
  slotDuration?: string;
  cooldownGap?: string;
  breaks?: BreakFormState[];
}

/**
 * A recurring rule: one weekday's working hours.
 *
 * The save button is disabled for an untouched form. Storing identical values is
 * harmless in itself, but it costs a booking scan and writes an audit entry saying
 * a change happened when none did, which is what makes a trail unreadable.
 */
function RuleDialog({
  heading,
  form,
  setForm,
  original,
  busy,
  problem,
  onClose,
  onSubmit,
}: {
  heading: string;
  form: RuleFormState;
  setForm: React.Dispatch<React.SetStateAction<RuleFormState>>;
  original: AdminScheduleRule | null;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const patch = useCallback(
    (change: HoursPatch) => setForm((previous) => ({ ...previous, ...change })),
    [setForm]
  );
  const unchanged = ruleFormIsUnchanged(form, original);

  return (
    <ConfirmDialog
      title={original ? 'Change these working hours' : heading}
      subtitle={original ? heading : 'These hours repeat every week until they are changed'}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          {unchanged && (
            <span className="mr-auto text-[0.6875rem] text-muted-foreground">
              Nothing has changed yet.
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={onSubmit} disabled={busy || unchanged}>
            {busy && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Working…' : original ? 'Save these hours' : 'Add these hours'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="rule-day" className="block text-xs font-medium text-primary">
            Weekday
          </label>
          <select
            id="rule-day"
            value={form.dayOfWeek}
            disabled={busy}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, dayOfWeek: Number(event.target.value) }))
            }
            className={`mt-1.5 ${FIELD}`}
          >
            {DAY_VALUES.map((day) => (
              <option key={day} value={day}>
                {weekdayName(day)}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={form.isActive}
            disabled={busy}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, isActive: event.target.checked }))
            }
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-hairline text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-primary">
              Offer these hours to clients
            </span>
            {/* The user's spec: schedule changes must not be confusable with the
                therapist's own accepting-bookings status. Said at the control. */}
            <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted-foreground">
              Switched off, the hours stay stored and nothing inside them is bookable. This is not
              the therapist&apos;s accepting-bookings status — that hides them from the booking page
              altogether and is set on their profile.
            </span>
          </span>
        </label>

        <HoursFields idPrefix="rule" form={form} patch={patch} disabled={busy} />
        <BreakRows idPrefix="rule" breaks={form.breaks} patch={patch} disabled={busy} />
        <CadenceNote form={form} />
        <SlotPreview form={form} />
      </div>
      {problem && <Problem text={problem} />}
    </ConfirmDialog>
  );
}

/**
 * A date exception: one calendar date that ignores the weekly rules.
 *
 * The two kinds are offered as a choice with its consequence written next to it,
 * because they are opposites and the words for them are not self-evident: one
 * removes every slot on the date, the other replaces the day's hours with different
 * ones. Getting that backwards either closes a working day or opens a holiday.
 */
function OverrideDialog({
  heading,
  form,
  setForm,
  busy,
  problem,
  onClose,
  onSubmit,
}: {
  heading: string;
  form: OverrideFormState;
  setForm: React.Dispatch<React.SetStateAction<OverrideFormState>>;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const patch = useCallback(
    (change: HoursPatch) => setForm((previous) => ({ ...previous, ...change })),
    [setForm]
  );
  const existing = form.overrideId !== null;

  return (
    <ConfirmDialog
      title={existing ? 'Change this date exception' : heading}
      subtitle={
        existing ? heading : 'One date only. The weekly rules are untouched by this.'
      }
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={onSubmit} disabled={busy}>
            {busy && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {busy ? 'Working…' : existing ? 'Save this exception' : 'Add this exception'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="override-date" className="block text-xs font-medium text-primary">
            Date
          </label>
          <input
            id="override-date"
            type="date"
            value={form.date}
            disabled={busy}
            onChange={(event) => setForm((previous) => ({ ...previous, date: event.target.value }))}
            className={`mt-1.5 ${FIELD}`}
          />
        </div>

        <fieldset disabled={busy}>
          <legend className="text-xs font-medium text-primary">What happens on this date</legend>
          <div className="mt-1.5 space-y-1.5">
            {(
              [
                {
                  value: 'blocked' as const,
                  label: 'Closed all day',
                  detail:
                    'No slots at all on this date, whatever the weekly rules say. Use this for leave and holidays.',
                },
                {
                  value: 'available' as const,
                  label: 'Different hours',
                  detail:
                    'These hours replace the weekly rules for this date only. Nothing outside them is offered.',
                },
              ] as const
            ).map((choice) => (
              <label key={choice.value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="override-type"
                  value={choice.value}
                  checked={form.type === choice.value}
                  onChange={() => setForm((previous) => ({ ...previous, type: choice.value }))}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 border-hairline text-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-primary">{choice.label}</span>
                  <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {choice.detail}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {form.type === 'available' && (
          <>
            <HoursFields idPrefix="override" form={form} patch={patch} disabled={busy} />
            <BreakRows idPrefix="override" breaks={form.breaks} patch={patch} disabled={busy} />
            <CadenceNote form={form} />
            <SlotPreview form={form} />
          </>
        )}

        <div>
          <label htmlFor="override-reason" className="block text-xs font-medium text-primary">
            Reason <span className="text-muted-foreground">(optional)</span>
          </label>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Stored on the exception and shown in this console. Clients never see it.
          </p>
          <input
            id="override-reason"
            type="text"
            value={form.reason}
            maxLength={300}
            disabled={busy}
            onChange={(event) => setForm((previous) => ({ ...previous, reason: event.target.value }))}
            placeholder="Therapist on leave"
            className={`mt-1.5 w-full ${FIELD} placeholder:text-muted-foreground`}
          />
        </div>
      </div>
      {problem && <Problem text={problem} />}
    </ConfirmDialog>
  );
}

/**
 * The window and the cadence, shared by both dialogs.
 *
 * `type="time"` rather than a text field: the stored format is a zero-padded
 * 24-hour `HH:MM` and typing is how `9:00` gets submitted. The check refuses that
 * anyway, but a picker means it cannot be typed in the first place.
 */
function HoursFields({
  idPrefix,
  form,
  patch,
  disabled,
}: {
  idPrefix: string;
  form: HoursShape;
  patch: (change: HoursPatch) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div>
        <label htmlFor={`${idPrefix}-start`} className="block text-xs font-medium text-primary">
          Start ({DISPLAY_TIME_ZONE_LABEL})
        </label>
        <input
          id={`${idPrefix}-start`}
          type="time"
          value={form.startTime}
          disabled={disabled}
          onChange={(event) => patch({ startTime: event.target.value })}
          className={`mt-1.5 w-full ${FIELD}`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-end`} className="block text-xs font-medium text-primary">
          End ({DISPLAY_TIME_ZONE_LABEL})
        </label>
        <input
          id={`${idPrefix}-end`}
          type="time"
          value={form.endTime}
          disabled={disabled}
          onChange={(event) => patch({ endTime: event.target.value })}
          className={`mt-1.5 w-full ${FIELD}`}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-length`} className="block text-xs font-medium text-primary">
          Session length
        </label>
        <select
          id={`${idPrefix}-length`}
          value={form.slotDuration}
          disabled={disabled}
          onChange={(event) => patch({ slotDuration: event.target.value })}
          className={`mt-1.5 w-full ${FIELD}`}
        >
          {/* Only present when what is stored is not a length this console offers.
              Rendering it as a fifth choice instead would let an already-wrong value
              be saved back without the operator ever reading it. */}
          {form.slotDuration === '' && <option value="">Choose…</option>}
          {SLOT_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-gap`} className="block text-xs font-medium text-primary">
          Gap after
        </label>
        <input
          id={`${idPrefix}-gap`}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_COOLDOWN_MINUTES}
          step={5}
          value={form.cooldownGap}
          disabled={disabled}
          onChange={(event) => patch({ cooldownGap: event.target.value })}
          className={`mt-1.5 w-full ${FIELD}`}
        />
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">Minutes. 0 for none.</p>
      </div>
    </div>
  );
}

/**
 * The breaks carved out of the window.
 *
 * A row added but not typed into is dropped by the form check rather than refused,
 * so an operator can add one and change their mind. A half-filled one is refused by
 * name, because silently dropping it would store a schedule missing a break they
 * believe they entered.
 */
function BreakRows({
  idPrefix,
  breaks,
  patch,
  disabled,
}: {
  idPrefix: string;
  breaks: readonly BreakFormState[];
  patch: (change: HoursPatch) => void;
  disabled: boolean;
}) {
  const update = (index: number, change: Partial<BreakFormState>) =>
    patch({ breaks: breaks.map((row, at) => (at === index ? { ...row, ...change } : row)) });

  return (
    <div>
      <p className="text-xs font-medium text-primary">Breaks</p>
      <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
        No session starts inside a break, and one that would run into a break is not offered at all.
      </p>
      {breaks.length === 0 ? (
        <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">None.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {breaks.map((row, index) => (
            <li key={`${idPrefix}-break-${index}`} className="flex items-center gap-2">
              <input
                type="time"
                aria-label={`Break ${index + 1} start`}
                value={row.startTime}
                disabled={disabled}
                onChange={(event) => update(index, { startTime: event.target.value })}
                className={FIELD}
              />
              <span aria-hidden="true" className="text-xs text-muted-foreground">
                –
              </span>
              <input
                type="time"
                aria-label={`Break ${index + 1} end`}
                value={row.endTime}
                disabled={disabled}
                onChange={(event) => update(index, { endTime: event.target.value })}
                className={FIELD}
              />
              <button
                type="button"
                aria-label={`Remove break ${index + 1}`}
                disabled={disabled}
                onClick={() => patch({ breaks: breaks.filter((_, at) => at !== index) })}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={disabled}
        onClick={() => patch({ breaks: [...breaks, { startTime: '', endTime: '' }] })}
      >
        <Plus aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Add a break
      </Button>
    </div>
  );
}

/** The divergence from the practice's 45-minute cadence, named but never blocked. */
function CadenceNote({ form }: { form: RuleFormState | OverrideFormState }) {
  const note = formCadenceWarning(form);
  if (!note) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-3 py-2 text-[0.6875rem] leading-relaxed text-warning">
      <TriangleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{note}</span>
    </p>
  );
}

/**
 * The start times the draft would actually offer.
 *
 * Generated by `generateTimeSlots` — the function the booking page itself calls — so
 * this is not an illustration of the rule but the rule's own output. "09:00 to 17:00,
 * 45-minute sessions" does not tell an operator the last bookable start is 15:45.
 */
function SlotPreview({ form }: { form: RuleFormState | OverrideFormState }) {
  const slots = useMemo(() => previewSlots(form), [form]);

  return (
    <div className="border-t border-hairline pt-3">
      <p className="text-xs font-medium text-primary">
        Start times this would offer{slots.length > 0 ? ` (${slots.length})` : ''}
      </p>
      {slots.length === 0 ? (
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          None. Either the hours are not filled in yet, or this window fits no session — which is the
          same empty answer a client would get on the booking page.
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {slots.map((slot) => (
              <span
                key={slot}
                className="tabular rounded border border-hairline bg-white px-1.5 py-0.5 text-[0.6875rem] text-primary"
              >
                {slot}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
            The last session starts at {slots[slots.length - 1]}, not at the end of the window: a
            start is only offered when the whole session fits before the end.
          </p>
        </>
      )}
    </div>
  );
}
