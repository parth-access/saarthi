'use client';

/**
 * One booking, as the record an operator acts from.
 *
 * The screen answers, without anyone opening the Firestore console: what state is
 * this booking in, was it paid, can the client join, what was emailed, what was
 * refunded, and what happened to it. So every field the projection sends is on
 * screen somewhere, grouped by the question it answers, and a field with no value
 * says so instead of vanishing — an absent row is indistinguishable from a
 * rendering bug, and "no refund recorded" is a different fact from "the refund
 * section failed to load".
 *
 * Three things deliberately do not appear:
 *
 *  - **buttons that would perform an operation.** Actions are the next increment,
 *    wired to the existing command handlers. What is shown instead is what the
 *    server *would* accept for a booking in this state, refusals and reasons
 *    included — useful on its own, and impossible to mistake for a control.
 *  - **the manage-booking token and the client's note.** Neither leaves the server
 *    (`adminBookingDetail.ts`). Their existence is reported; their content is not.
 *  - **a "healthy" indicator.** Nothing here is green because the page loaded. The
 *    notices at the top are each derived from a stored field, and an absence of
 *    notices means no stored field says anything is wrong — not that all is well.
 *
 * Everything deciding what a value *means* lives in the two presentation modules
 * and is tested there. This file arranges it.
 */
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  ExternalLink,
  Info,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { useTherapists } from '@/hooks/useTherapists';
import type { AdminBookingDetail } from '@/domains/booking/queries/adminBookingDetail';
import { BookingTimeline } from './BookingTimeline';
import { CopyableId } from './CopyableId';
import { useAdminBookingDetail } from './useAdminBookingDetail';
import {
  formatRefundAmount,
  formatTimelineKind,
  formatTimelineMoment,
  holdSummary,
  manageLinkSummary,
} from './adminBookingDetailPresentation';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatAmount,
  formatCreatedAt,
  formatSessionDay,
  formatSessionDayLong,
  formatSessionKind,
  humanizeStatus,
  meetIndicator,
  paymentBadge,
  rowFlags,
  statusBadge,
  toneClasses,
  type StatusBadge,
} from './adminBookingPresentation';

/** Verbs an operator recognises, for the ids the query layer uses. */
const ACTION_LABELS: Record<string, string> = {
  confirm: 'Confirm this booking',
  cancel: 'Cancel this booking',
  complete: 'Mark the session completed',
  no_show: 'Mark the client a no-show',
  reschedule: 'Reschedule the session',
};

export function BookingDetailScreen({ bookingId }: { bookingId: string }) {
  const { data, loading, initialLoading, error, notFound, reload } =
    useAdminBookingDetail(bookingId);
  const { therapists } = useTherapists();

  const therapistName = useMemo(() => {
    const byId = new Map(therapists.map((therapist) => [therapist.id, therapist.name]));
    return (id: string) => (id ? byId.get(id) ?? id : '—');
  }, [therapists]);

  // Sampled once per payload rather than on every render: a hold that lapses while
  // the page sits open must not make the sentence flicker mid-scroll, and the
  // clock has to be the browser's, since the value is only ever read after a
  // client-side fetch has resolved. `data` is the dependency on purpose — the
  // reading is re-taken when a new payload arrives — even though the expression
  // does not mention it, which is what the lint rule is objecting to.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nowMs = useMemo(() => Date.now(), [data]);

  if (notFound) {
    return (
      <div className="space-y-3">
        <BackLink />
        <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
          <p className="font-medium text-primary">No booking with this id</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            The read succeeded and found nothing, so there is nothing to retry.{' '}
            <code className="rounded bg-neutral-surface px-1 py-0.5 font-mono">{bookingId}</code>{' '}
            either never existed or was deleted. Search the list by the client&apos;s email address
            to find the booking you meant.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/admin/bookings">Back to bookings</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Narrowed on the whole payload, not just the booking, so the timeline and the
  // action verdicts below are known to have arrived with it.
  if (!data) {
    return (
      <div className="space-y-3">
        <BackLink />
        {initialLoading ? <DetailSkeleton /> : <LoadFailed error={error} onRetry={reload} />}
      </div>
    );
  }

  const booking = data.booking;
  const status = statusBadge(booking);
  const payment = paymentBadge(booking);
  const flags = rowFlags({
    rescheduleCount: booking.reschedule.history.length,
    refundStatus: booking.refund.status,
  });
  const meet = meetIndicator({
    hasMeetingLink: booking.meeting.url !== null,
    status: booking.status,
    calendarStatus: booking.meeting.calendarStatus,
  });
  const hold = holdSummary(booking.access.holdExpiresAtIso, nowMs);
  // A lapsed hold only tells an operator something they can act on while the
  // booking is still waiting to be paid. On a confirmed session the slot was long
  // since committed, and repeating it there would be noise on every old booking.
  const holdIsLive =
    booking.statusGroup === 'awaiting_payment' || booking.statusGroup === 'holding';

  return (
    <div className="space-y-3">
      <BackLink />

      {error && (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}>
          <span className="block">{error}</span>
          <span className="mt-0.5 block text-[0.6875rem]">
            What is shown below is from the last successful read and may be out of date.
          </span>
          <Button variant="outline" size="sm" className="mt-2" onClick={reload}>
            <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            Try again
          </Button>
        </Banner>
      )}

      <header
        className={`rounded-xl border border-hairline bg-white p-4 shadow-sm ${
          loading ? 'opacity-70 transition-opacity' : 'transition-opacity'
        }`}
        aria-busy={loading}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {formatSessionDayLong(booking.session.date)} · {booking.session.time || '—'}{' '}
              {DISPLAY_TIME_ZONE_LABEL}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-primary">
              {booking.client.name || 'Name not recorded'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatSessionKind(booking.session)} · with{' '}
              {therapistName(booking.session.therapistId)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <div className="flex flex-wrap items-center gap-1">
              <Badge badge={status} />
              {payment && <Badge badge={payment} />}
              {flags.map((flag) => (
                <Badge key={flag.label} badge={flag} />
              ))}
            </div>
            <CopyableId id={booking.id} size="md" />
          </div>
        </div>
      </header>

      <Attention booking={booking} meet={meet} hold={holdIsLive ? hold : null} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Session">
          <Field label={`Date (${DISPLAY_TIME_ZONE_LABEL})`} value={formatSessionDayLong(booking.session.date)} />
          <Field label={`Time (${DISPLAY_TIME_ZONE_LABEL})`} value={booking.session.time} />
          <Field label="Type" value={humanizeStatus(booking.session.sessionType)} />
          <Field label="Mode" value={booking.session.sessionMode && humanizeStatus(booking.session.sessionMode)} />
          <Field label="Therapist" value={therapistName(booking.session.therapistId)} />
          <Field label="Therapist id" value={booking.session.therapistId} mono />
          <Field
            label="Stored UTC instant"
            value={booking.session.utcDateTime}
            mono
            hint="Written at booking time. The IST date and time above are what the client and therapist were told."
          />
          <Field label="Booking created" value={formatCreatedAt(booking.createdAtIso)} />
          <Field label="Last updated" value={formatCreatedAt(booking.updatedAtIso)} />
        </Card>

        <Card title="Client">
          <Field label="Name" value={booking.client.name} />
          <Field label="Email">
            {booking.client.email ? (
              <a href={`mailto:${booking.client.email}`} className="break-all underline underline-offset-2">
                {booking.client.email}
              </a>
            ) : (
              <Absent />
            )}
          </Field>
          <Field label="Phone">
            {booking.client.phone ? (
              <a href={`tel:${booking.client.phone}`} className="tabular underline underline-offset-2">
                {booking.client.phone}
              </a>
            ) : (
              <Absent />
            )}
          </Field>
          <Field
            label="Account"
            value={booking.client.userId ? 'Signed-in account' : 'Booked as a guest'}
            hint={booking.client.userId ?? undefined}
          />
          <Field label="Gender" value={booking.client.gender && humanizeStatus(booking.client.gender)} />
          <Field label="Age" value={booking.client.age === null ? null : String(booking.client.age)} />
          <Field
            label="Booking note"
            value={booking.client.hasNote ? 'A note was written' : 'No note'}
            hint={
              booking.client.hasNote
                ? 'The text is not sent to this console. It is what the client wrote about why they are seeking therapy, and the assigned therapist reads it.'
                : undefined
            }
          />
        </Card>

        <Card title="Payment" subtitle="Amounts as Razorpay recorded them.">
          <Field label="Amount">
            <span className="tabular font-medium text-primary">
              {formatAmount(booking.payment.amountRupees, booking.payment.currency)}
            </span>
          </Field>
          <Field label="Payment status" value={booking.paymentStatus && humanizeStatus(booking.paymentStatus)} />
          <Field label="Verified at" value={formatCreatedAt(booking.payment.verifiedAtIso)} />
          <Field
            label="Currency"
            value={booking.payment.currency}
            hint={booking.payment.currency ? undefined : 'Not stored. Amounts are treated as INR.'}
          />
          <Field label="Razorpay order id" value={booking.payment.razorpayOrderId} mono />
          <Field
            label="Razorpay payment id"
            value={booking.payment.razorpayPaymentId}
            mono
            hint={booking.payment.isMockPayment ? 'A seeded test payment — no real capture exists.' : undefined}
          />
        </Card>

        <Card
          title="Refund"
          subtitle={
            booking.refund.status === null && booking.refund.amountPaise === null
              ? 'No refund has been recorded against this booking.'
              : undefined
          }
        >
          <Field label="Refund status" value={booking.refund.status && humanizeStatus(booking.refund.status)} />
          <Field
            label="Refund amount"
            hint="Stored in paise and converted here. The payment amount above is stored in rupees."
          >
            <span className="tabular font-medium text-primary">
              {formatRefundAmount(booking.refund.amountPaise)}
            </span>
          </Field>
          <Field label="Refunded at" value={formatCreatedAt(booking.refund.atIso)} />
          <Field label="Razorpay refund id" value={booking.refund.id} mono />
        </Card>

        <Card title="Meeting and calendar">
          <Field label="Meet link">
            {booking.meeting.url ? (
              <a
                href={booking.meeting.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all underline underline-offset-2"
              >
                Open the Meet link
                <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className={meet.presence === 'missing' ? 'text-danger' : 'text-muted-foreground'}>
                {meet.presence === 'missing' ? 'None — and this session is confirmed' : 'None'}
              </span>
            )}
          </Field>
          <Field label="Calendar status" value={booking.meeting.calendarStatus && humanizeStatus(booking.meeting.calendarStatus)} />
          <Field label="Calendar created" value={formatCreatedAt(booking.meeting.calendarCreatedAtIso)} />
          <Field label="Calendar event id" value={booking.meeting.calendarEventId} mono />
          <Field label="Calendar error" value={booking.meeting.calendarError} wide />
        </Card>

        <Card title="Emails and reminders" subtitle="What this booking has sent, as the sender recorded it.">
          <Field label="Confirmation email" value={booking.notifications.emailStatus && humanizeStatus(booking.notifications.emailStatus)} />
          <Field
            label="Attempts"
            value={
              booking.notifications.emailAttempts === null
                ? null
                : String(booking.notifications.emailAttempts)
            }
          />
          <Field label="Reminder" value={booking.notifications.reminderStatus && humanizeStatus(booking.notifications.reminderStatus)} />
          <Field label="Reminder sent" value={formatCreatedAt(booking.notifications.reminderSentAtIso)} />
          <Field label="Last email error" value={booking.notifications.lastEmailError} wide />
          <Field label="Reminder error" value={booking.notifications.reminderError} wide />
        </Card>

        <Card
          title="Slot hold and manage link"
          subtitle="Who can change this booking without going through the console."
        >
          <Field label="Slot hold" value={hold.label} hint={hold.detail} wide />
          <Field label="Hold expires" value={formatCreatedAt(booking.access.holdExpiresAtIso)} />
          <Field label="Manage link" value={manageLinkSummary(booking.access)} wide />
        </Card>

        {hasOutcome(booking) && (
          <Card title="Outcome" subtitle="Why this booking ended the way it did.">
            <Field label="Reason" value={booking.outcome.reason} wide />
            <Field label="Operator note" value={booking.outcome.customNote} wide />
            <Field label="No-show reason" value={booking.outcome.noShowReason} wide />
            <Field label="Declined at" value={formatCreatedAt(booking.outcome.declinedAtIso)} />
            <Field label="Declined by" value={booking.outcome.declinedBy} mono />
            <Field
              label="Client rating"
              value={booking.outcome.reviewRating === null ? null : `${booking.outcome.reviewRating} / 5`}
            />
            <Field label="Client review" value={booking.outcome.reviewComment} wide />
          </Card>
        )}

        {(booking.reschedule.history.length > 0 || booking.reschedule.originalDate !== null) && (
          <Panel
            title="Reschedule history"
            subtitle="Taken from the array stored on the booking, so only moves made through the platform appear."
          >
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Field
                label="Originally booked for"
                value={
                  booking.reschedule.originalDate
                    ? `${formatSessionDay(booking.reschedule.originalDate)} · ${booking.reschedule.originalTime ?? '—'}`
                    : null
                }
              />
              <Field label="Last moved" value={formatCreatedAt(booking.reschedule.lastAtIso)} />
            </dl>
            {booking.reschedule.history.length > 0 && (
              <ol className="mt-3 space-y-2 border-t border-hairline pt-3">
                {booking.reschedule.history.map((record, index) => (
                  <li key={`${record.atIso ?? 'undated'}-${index}`} className="text-xs">
                    <p className="text-primary/80">
                      <span className="tabular">
                        {formatSessionDay(record.previousDate)} {record.previousTime}
                      </span>
                      <span className="mx-1.5 text-muted-foreground">→</span>
                      <span className="tabular font-medium text-primary">
                        {formatSessionDay(record.newDate)} {record.newTime}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                      {formatTimelineMoment(record.atIso)}
                      {record.reason ? ` · ${record.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}

        <Panel
          title="What the server would accept"
          subtitle="This console cannot submit these yet. Each line is what the booking commands' own guards would allow for a booking in this state — nothing here authorizes anything."
        >
          {data.actions.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No verdicts were returned for this booking.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.actions.map((verdict) => (
                <li key={verdict.action} className="flex items-start gap-2 text-xs">
                  {verdict.allowed ? (
                    <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  ) : (
                    <Ban aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className={verdict.allowed ? 'font-medium text-primary' : 'text-primary/70'}>
                      {ACTION_LABELS[verdict.action] ?? formatTimelineKind(verdict.action)}
                    </span>
                    <span className="text-muted-foreground">
                      {verdict.allowed ? ' — allowed' : ` — ${verdict.reason || 'not available'}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <BookingTimeline timeline={data.timeline} />
    </div>
  );
}

/** Whether anything in the outcome group is stored, so the card is not empty. */
function hasOutcome(booking: AdminBookingDetail): boolean {
  const outcome = booking.outcome;
  return (
    outcome.reason !== null ||
    outcome.customNote !== null ||
    outcome.noShowReason !== null ||
    outcome.declinedAtIso !== null ||
    outcome.declinedBy !== null ||
    outcome.reviewRating !== null ||
    outcome.reviewComment !== null
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/bookings"
      className="inline-flex items-center gap-1.5 text-xs text-primary/70 underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
      All bookings
    </Link>
  );
}

/**
 * The things a stored field says are wrong, and nothing else.
 *
 * Each notice names the field it came from in substance, so an operator can tell
 * a Calendar failure from a missing link from a lapsed hold. There is no
 * "everything is fine" case: no notices means nothing recorded a problem, which
 * is not the same claim.
 */
function Attention({
  booking,
  meet,
  hold,
}: {
  booking: AdminBookingDetail;
  meet: ReturnType<typeof meetIndicator>;
  /** Null when the hold is no longer the thing standing between client and slot. */
  hold: ReturnType<typeof holdSummary> | null;
}) {
  const notices: { tone: 'danger' | 'warning' | 'info'; text: string }[] = [];

  if (meet.presence === 'missing') {
    notices.push({ tone: 'danger', text: meet.title });
  }
  if (hold?.state === 'lapsed') {
    notices.push({
      tone: 'warning',
      text: `${hold.detail} The booking itself still reads “${humanizeStatus(booking.status)}” — nothing rewrites it when a hold lapses.`,
    });
  }
  if (booking.meeting.calendarError) {
    notices.push({ tone: 'danger', text: `Google Calendar reported: ${booking.meeting.calendarError}` });
  }
  if (booking.notifications.lastEmailError) {
    notices.push({ tone: 'warning', text: `The last email attempt failed: ${booking.notifications.lastEmailError}` });
  }
  if (booking.notifications.reminderError) {
    notices.push({ tone: 'warning', text: `The reminder failed: ${booking.notifications.reminderError}` });
  }
  if (booking.payment.isMockPayment) {
    notices.push({
      tone: 'info',
      text: 'This is a seeded test payment. No real capture exists, so a refund cannot be issued against it.',
    });
  }
  if (booking.access.hasManageToken && !booking.access.manageTokenInvalidated) {
    notices.push({ tone: 'info', text: manageLinkSummary(booking.access) });
  }

  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <Banner
          key={notice.text}
          tone={notice.tone}
          icon={
            notice.tone === 'info' ? (
              <Info aria-hidden="true" className="h-4 w-4" />
            ) : (
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            )
          }
        >
          {notice.text}
        </Banner>
      ))}
    </div>
  );
}

const BANNER_TONES = {
  info: 'bg-info-surface text-info',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-danger-surface text-danger',
} as const;

function Banner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof BANNER_TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-relaxed ${BANNER_TONES[tone]}`}
    >
      <span className="mt-px shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Badge({ badge }: { badge: StatusBadge | { label: string; tone: StatusBadge['tone']; title: string } }) {
  return (
    <span
      title={badge.title}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium ${toneClasses(badge.tone)}`}
    >
      {badge.label}
    </span>
  );
}

/** The section shell. `Card` adds the two-column field grid; `Panel` does not. */
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
      {/* h3: the shell owns the page's h1 and the booking's own name is the h2, so
          a section heading here is a level below both rather than competing. */}
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Panel title={title} subtitle={subtitle}>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </Panel>
  );
}

/**
 * One labelled value.
 *
 * An empty or null value renders as an em dash rather than as a blank space, so
 * "not stored" and "failed to render" cannot be confused. `hint` carries the
 * thing an operator would otherwise have to know from elsewhere — that the refund
 * is stored in paise, that the note exists but is withheld.
 */
function Field({
  label,
  value,
  hint,
  mono,
  wide,
  children,
}: {
  label: string;
  value?: string | null;
  hint?: string;
  mono?: boolean;
  /** Spans both columns, for stored error text and full sentences. */
  wide?: boolean;
  children?: React.ReactNode;
}) {
  const empty = value === null || value === undefined || value.length === 0;
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <dt className="text-[0.6875rem] uppercase tracking-[0.06em] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-words text-xs text-primary/80 ${mono ? 'font-mono' : ''}`}>
        {children ?? (empty ? <Absent /> : value)}
      </dd>
      {hint && <p className="mt-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Absent() {
  return (
    <span className="text-muted-foreground" title="Not stored on this booking.">
      —
    </span>
  );
}

function LoadFailed({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-10 text-center shadow-sm">
      <p className="font-medium text-primary">This booking could not be loaded</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        {error ?? 'The read did not complete.'} Nothing about the booking is shown, because a partly
        loaded booking is worse than none — you would be acting on state you cannot fully see.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RotateCcw aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

/** Shapes only, on the very first load. Nothing here can be read as a value. */
function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading this booking…</p>
      <div className="h-24 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl bg-neutral-surface" />
        ))}
      </div>
    </div>
  );
}




