'use client';

/**
 * The five operations an operator can perform on a booking, and what each one
 * will do before they commit to it.
 *
 * Everything that decides *meaning* is elsewhere and tested there:
 * `bookingActionCopy.ts` for the consequences and the refund prediction,
 * `adminBookingActionResponse.ts` for reading the server's answer. This file
 * arranges them and owns the request.
 *
 * The properties worth preserving through any later edit:
 *
 *  - **A disabled button is not a security boundary.** The verdicts come from
 *    `permittedAdminActions`, which mirrors the handlers' guards so an operator is
 *    not offered something the server will refuse. Every one of those guards runs
 *    again inside the command's transaction. Deleting this component would change
 *    what is offered and change nothing about what is permitted.
 *  - **Nothing is reported until the server has answered.** There is no optimistic
 *    update. On success the detail is refetched, so the screen shows persisted
 *    state — which matters because the calendar and email work happens after the
 *    commit and can fail on its own.
 *  - **A no-op is reported as a no-op.** `changed: false` renders neutrally, never
 *    as a success, so a double-click cannot read as a second cancellation.
 *  - **An indeterminate answer offers a reload, not a retry.** If it is not known
 *    whether the write landed, retrying is the one action that could double-apply.
 *  - **The refund figure in the cancel dialog is a prediction and says so.** The
 *    server recomputes the percent at transaction time.
 */
import { AlertTriangle, Check, Info, Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { useAvailability } from '@/hooks/useAvailability';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { BOOKING_WINDOW_DAYS } from '@/shared/constants';
import { getIstNow, istDatePlusDays } from '@/shared/scheduling/slots';
import type {
  AdminBookingActionVerdict,
  AdminBookingDetail,
} from '@/domains/booking/queries/adminBookingDetail';
import {
  ACTION_NETWORK_ERROR,
  ACTION_SESSION_ERROR,
  interpretAdminActionResponse,
  type AdminActionResult,
} from './adminBookingActionResponse';
import {
  ACTION_BUTTONS,
  ACTION_LABELS,
  ACTION_ORDER,
  ACTION_TONE,
  actionFactsFrom,
  canSubmit,
  consequencesFor,
  reasonProblem,
  type BookingActionId,
} from './bookingActionCopy';
import { DISPLAY_TIME_ZONE_LABEL, formatSessionDayLong } from './adminBookingPresentation';

interface Draft {
  reason: string;
  note: string;
  date: string;
  /** `HH:MM` in IST, or null until a slot is picked. */
  slot: string | null;
}

export function BookingActions({
  booking,
  verdicts,
  onApplied,
}: {
  booking: AdminBookingDetail;
  verdicts: readonly AdminBookingActionVerdict[];
  /** Refetches the detail. Called after any answer that may have changed state. */
  onApplied: () => void;
}) {
  const [openAction, setOpenAction] = useState<BookingActionId | null>(null);
  const [draft, setDraft] = useState<Draft>({ reason: '', note: '', date: '', slot: null });
  const [submitting, setSubmitting] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ action: BookingActionId; result: AdminActionResult } | null>(
    null
  );

  const facts = useMemo(() => actionFactsFrom(booking), [booking]);
  const byAction = useMemo(
    () => new Map(verdicts.map((verdict) => [verdict.action, verdict])),
    [verdicts]
  );

  const open = useCallback(
    (action: BookingActionId) => {
      // A fresh draft every time: a reason typed for one action must not be carried
      // into another, and a stale slot must not be submitted against a new dialog.
      setDraft({ reason: '', note: '', date: booking.session.date, slot: null });
      setDialogError(null);
      setOutcome(null);
      setOpenAction(action);
    },
    [booking.session.date]
  );

  const close = useCallback(() => {
    setOpenAction(null);
    setDialogError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!openAction || submitting) return;
    setSubmitting(true);
    setDialogError(null);

    const payload: Record<string, unknown> = { action: openAction };
    if (openAction === 'cancel') {
      payload.reason = draft.reason.trim();
      if (draft.note.trim()) payload.note = draft.note.trim();
    }
    if (openAction === 'no_show' && draft.reason.trim()) {
      payload.reason = draft.reason.trim();
    }
    if (openAction === 'reschedule') {
      payload.date = draft.date;
      payload.time = draft.slot;
    }

    let result: AdminActionResult;
    try {
      const response = await fetchWithAuth(
        `/api/admin/bookings/${encodeURIComponent(booking.id)}/actions`,
        { method: 'POST', body: JSON.stringify(payload) }
      );
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Left null; the interpreter treats an unreadable 2xx as indeterminate
        // rather than as either outcome.
      }
      result = interpretAdminActionResponse(response.status, body);
    } catch (err) {
      // `fetchWithAuth` throws before sending when there is no Firebase user, which
      // is a different problem from a network failure and a different fix.
      const noSession = err instanceof Error && err.message === 'User not authenticated';
      result = {
        ok: false,
        error: noSession ? ACTION_SESSION_ERROR : ACTION_NETWORK_ERROR,
        indeterminate: false,
      };
    }

    setSubmitting(false);

    if (result.ok) {
      setOutcome({ action: openAction, result });
      setOpenAction(null);
      // Even for `changed: false`: the booking may have moved for another reason
      // since this page loaded, and that is exactly what the operator should see.
      onApplied();
      return;
    }

    if (result.indeterminate) {
      // Reported outside the dialog and the dialog is closed, so the only offered
      // next step is a reload. Leaving it open beside a live submit button invites
      // the retry that could double-apply.
      setOutcome({ action: openAction, result });
      setOpenAction(null);
      return;
    }

    // A refusal the server explained. The dialog stays open with the draft intact,
    // because the operator's next move is usually to change one field.
    setDialogError(result.error);
  }, [booking.id, draft, onApplied, openAction, submitting]);

  const available = ACTION_ORDER.filter((action) => byAction.has(action));

  return (
    <section className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-primary">Actions</h3>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        Each of these runs the same command the therapist dashboard and the client&apos;s
        manage-booking link run. An unavailable action names the state that refuses it — the
        server enforces that again either way.
      </p>

      {available.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No action verdicts were returned for this booking, so none are offered. Reload to try
          again.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {available.map((action) => {
            const verdict = byAction.get(action)!;
            const tone = ACTION_TONE[action];
            return (
              <li key={action}>
                <Button
                  type="button"
                  size="sm"
                  variant={tone === 'danger' ? 'destructive' : tone === 'primary' ? 'primary' : 'outline'}
                  disabled={!verdict.allowed}
                  onClick={() => open(action)}
                  // The reason is on the button itself rather than only in a
                  // tooltip-shaped hint, so it is reachable without a mouse.
                  aria-describedby={verdict.allowed ? undefined : `${action}-refusal`}
                  title={verdict.allowed ? ACTION_LABELS[action] : verdict.reason}
                >
                  {ACTION_BUTTONS[action]}
                </Button>
                {!verdict.allowed && verdict.reason && (
                  <span id={`${action}-refusal`} className="sr-only">
                    {verdict.reason}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Why the greyed-out ones are greyed out, visibly rather than on hover. */}
      {available.some((action) => !byAction.get(action)!.allowed) && (
        <ul className="mt-3 space-y-1 border-t border-hairline pt-3">
          {available
            .filter((action) => !byAction.get(action)!.allowed)
            .map((action) => (
              <li key={action} className="text-[0.6875rem] leading-relaxed text-muted-foreground">
                <span className="font-medium text-primary/70">{ACTION_BUTTONS[action]}</span> —{' '}
                {byAction.get(action)!.reason || 'not available for a booking in this state'}
              </li>
            ))}
        </ul>
      )}

      {outcome && <Outcome action={outcome.action} result={outcome.result} onReload={onApplied} />}

      {openAction && (
        <ActionDialog
          action={openAction}
          booking={booking}
          facts={facts}
          draft={draft}
          setDraft={setDraft}
          submitting={submitting}
          error={dialogError}
          onClose={close}
          onSubmit={submit}
        />
      )}
    </section>
  );
}

/**
 * What the server said happened.
 *
 * Three visual states, because there are three meanings: applied, applied-nothing,
 * and not-known. The third is the one that must not be styled as a failure — a
 * failure invites a retry.
 */
function Outcome({
  action,
  result,
  onReload,
}: {
  action: BookingActionId;
  result: AdminActionResult;
  onReload: () => void;
}) {
  if (!result.ok) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-xl bg-warning-surface px-3 py-2.5 text-xs leading-relaxed text-warning"
      >
        <span className="flex items-start gap-2">
          <AlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          <span className="min-w-0">{result.error}</span>
        </span>
        <Button variant="outline" size="sm" className="mt-2" onClick={onReload}>
          <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Reload this booking
        </Button>
      </div>
    );
  }

  const applied = result.changed;
  return (
    <div
      role="status"
      className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
        applied ? 'bg-success-surface text-success' : 'bg-info-surface text-info'
      }`}
    >
      <span className="flex items-start gap-2">
        {applied ? (
          <Check aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
        ) : (
          <Info aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0">
          <span className="font-medium">{result.summary}</span>
          <span className="sr-only"> ({ACTION_LABELS[action]})</span>
          {result.details.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {result.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </span>
      </span>
    </div>
  );
}

function ActionDialog({
  action,
  booking,
  facts,
  draft,
  setDraft,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  action: BookingActionId;
  booking: AdminBookingDetail;
  facts: ReturnType<typeof actionFactsFrom>;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: () => void;
}) {
  // Sampled once when the dialog opens. A refund percent that re-derives on every
  // keystroke would flicker across a cutoff while the operator is typing a reason.
  const [nowMs] = useState(() => Date.now());
  const consequences = useMemo(() => consequencesFor(action, facts, nowMs), [action, facts, nowMs]);
  const ready = canSubmit(action, { reason: draft.reason, slot: draft.slot });

  return (
    <ConfirmDialog
      title={consequences.title}
      subtitle={`${booking.client.name || 'Client name not recorded'} · ${formatSessionDayLong(
        booking.session.date
      )} ${booking.session.time} ${DISPLAY_TIME_ZONE_LABEL}`}
      onClose={onClose}
      busy={submitting}
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Don&apos;t act
          </Button>
          <Button
            type="button"
            size="sm"
            variant={consequences.tone === 'danger' ? 'destructive' : 'primary'}
            onClick={onSubmit}
            disabled={submitting || !ready}
          >
            {submitting && <Loader2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {submitting ? 'Working…' : consequences.confirmLabel}
          </Button>
        </>
      }
    >
      {action === 'reschedule' && (
        <RescheduleFields booking={booking} draft={draft} setDraft={setDraft} disabled={submitting} />
      )}

      <div className={action === 'reschedule' ? 'mt-4' : undefined}>
        <p className="text-xs font-medium text-primary">What this will do</p>
        <ul className="mt-1.5 space-y-1.5">
          {consequences.lines.map((line) => (
            <li key={line} className="flex items-start gap-2 text-xs leading-relaxed text-primary/80">
              <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/40" />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
        {consequences.irreversible && (
          <p className="mt-2 text-xs font-medium text-danger">
            There is no undo. Rebooking the client means creating a new booking, which takes a new
            payment.
          </p>
        )}
      </div>

      {(action === 'cancel' || action === 'no_show') && (
        <ReasonFields action={action} draft={draft} setDraft={setDraft} disabled={submitting} />
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-danger-surface px-3 py-2 text-xs leading-relaxed text-danger"
        >
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}

function ReasonFields({
  action,
  draft,
  setDraft,
  disabled,
}: {
  action: 'cancel' | 'no_show';
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  disabled: boolean;
}) {
  const required = action === 'cancel';
  const problem = reasonProblem(draft.reason, required);
  // Only once something has been typed: an error on an untouched required field is
  // a scolding, and the submit button is already disabled.
  const showProblem = draft.reason.length > 0 && problem !== null;

  return (
    <div className="mt-4 space-y-3 border-t border-hairline pt-3">
      <div>
        <label htmlFor="action-reason" className="block text-xs font-medium text-primary">
          Reason {required ? '' : <span className="text-muted-foreground">(optional)</span>}
        </label>
        <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {action === 'cancel'
            ? 'Stored on the booking and written to the audit trail. On a booking that was never paid, it also appears in the decline email the client receives.'
            : 'Stored on the booking and visible to the therapist. It is not emailed to anyone.'}
        </p>
        <textarea
          id="action-reason"
          value={draft.reason}
          onChange={(event) => setDraft((previous) => ({ ...previous, reason: event.target.value }))}
          disabled={disabled}
          rows={2}
          maxLength={500}
          aria-invalid={showProblem}
          aria-describedby={showProblem ? 'action-reason-problem' : undefined}
          className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          placeholder={
            action === 'cancel' ? 'Therapist unwell — offered to rebook' : 'Client did not join the Meet'
          }
        />
        {showProblem && (
          <p id="action-reason-problem" className="mt-1 text-[0.6875rem] text-danger">
            {problem}
          </p>
        )}
      </div>

      {action === 'cancel' && (
        <div>
          <label htmlFor="action-note" className="block text-xs font-medium text-primary">
            Note to the client <span className="text-muted-foreground">(optional)</span>
          </label>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Included in the decline email on an unpaid booking. On a paid or confirmed one it is
            stored but not sent, because no cancellation email is sent at all.
          </p>
          <textarea
            id="action-note"
            value={draft.note}
            onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))}
            disabled={disabled}
            rows={2}
            maxLength={1000}
            className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          />
        </div>
      )}
    </div>
  );
}

/**
 * The new slot, chosen from what the therapist is actually available for.
 *
 * A slot grid rather than a free-text time field, for two reasons. The endpoint
 * requires a zero-padded `HH:MM` because the `locked_slots` document id is built
 * from it, and typing is how `9:00` gets submitted. And `/api/availability`
 * already applies every rule the reschedule command will apply — the therapist's
 * configured hours, competing bookings, live locks, past slots in IST, the
 * booking window — and, given `excludeBookingId`, already omits this booking's own
 * current slot, which is the "cannot reschedule to the current session time"
 * refusal. Offering only what it returns means the common refusals cannot be hit.
 */
function RescheduleFields({
  booking,
  draft,
  setDraft,
  disabled,
}: {
  booking: AdminBookingDetail;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  disabled: boolean;
}) {
  // The server decides temporally against IST; these bounds only stop the picker
  // offering days it will certainly refuse.
  const [minDate] = useState(() => getIstNow().date);
  const [maxDate] = useState(() => istDatePlusDays(BOOKING_WINDOW_DAYS));

  const { slots, loading, error, refetch } = useAvailability(
    booking.session.therapistId,
    draft.date || null,
    booking.id
  );

  const offered = slots.filter((slot) => slot.isAvailable);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="reschedule-date" className="block text-xs font-medium text-primary">
          New date ({DISPLAY_TIME_ZONE_LABEL})
        </label>
        <input
          id="reschedule-date"
          type="date"
          value={draft.date}
          min={minDate}
          max={maxDate}
          disabled={disabled}
          // Changing the date invalidates the picked slot: submitting a time from a
          // day that is no longer selected would move the session somewhere nobody
          // chose.
          onChange={(event) =>
            setDraft((previous) => ({ ...previous, date: event.target.value, slot: null }))
          }
          className="mt-1.5 w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:w-auto"
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-primary">Available times</p>
          <button
            type="button"
            onClick={refetch}
            disabled={disabled || loading}
            className="inline-flex items-center gap-1 text-[0.6875rem] text-primary/70 underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          >
            <RotateCcw aria-hidden="true" className="h-3 w-3" />
            Refresh
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-1.5 text-xs leading-relaxed text-danger">
            {error} Without this list there is nothing safe to offer, so no time can be picked.
          </p>
        ) : loading ? (
          <p className="mt-1.5 text-xs text-muted-foreground" aria-busy="true">
            Checking what this therapist is available for…
          </p>
        ) : offered.length === 0 ? (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Nothing is free on this date. That is the therapist&apos;s own availability, other
            bookings and live holds combined — pick another date. This booking&apos;s current slot is
            excluded, since a session cannot be moved to where it already is.
          </p>
        ) : (
          <>
            <div role="group" aria-label="Available times" className="mt-1.5 flex flex-wrap gap-1.5">
              {offered.map((slot) => {
                const picked = draft.slot === slot.time;
                return (
                  <button
                    key={slot.time}
                    type="button"
                    aria-pressed={picked}
                    disabled={disabled}
                    onClick={() => setDraft((previous) => ({ ...previous, slot: slot.time }))}
                    className={`tabular rounded-lg border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
                      picked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-hairline bg-white text-primary hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    {slot.time}
                  </button>
                );
              })}
            </div>
            {draft.slot === null && (
              <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">
                Pick a time to continue.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
