'use client';

/**
 * What happened to this booking, in the order it happened.
 *
 * The trail is assembled from the two audit collections that actually exist, so
 * it is honest about being incomplete in three specific ways, each stated on
 * screen rather than papered over:
 *
 *  - a **half that could not be read** is named, because four surviving events
 *    would otherwise read as the whole history;
 *  - a **truncated** trail says the events shown may not be the most recent, since
 *    the queries carry no `orderBy` and the 200 returned are an arbitrary subset;
 *  - an **empty** trail says nothing was recorded, not that nothing happened. Most
 *    of the booking lifecycle writes an audit entry, but not all of it does, and
 *    an operator concluding "no refund was ever attempted" from silence here would
 *    be reading more than the data supports.
 *
 * Entries are rendered from the stored `kind` with no filtering: an event this
 * build does not recognise is still shown, humanized, because an unknown event in
 * an audit trail is exactly the thing worth seeing.
 */
import { AlertTriangle } from 'lucide-react';
import type { AdminTimelineEntry } from '@/domains/booking/queries/adminBookingDetail';
import {
  describeTimelineGaps,
  type AdminBookingTimeline,
} from './adminBookingDetailResponse';
import { DISPLAY_TIME_ZONE_LABEL } from './adminBookingPresentation';
import {
  formatTimelineKind,
  formatTimelineMoment,
  timelineSourceLabel,
} from './adminBookingDetailPresentation';

export function BookingTimeline({ timeline }: { timeline: AdminBookingTimeline }) {
  const note = describeTimelineGaps(timeline);

  return (
    <section
      aria-labelledby="booking-history-heading"
      className="rounded-xl border border-hairline bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="booking-history-heading" className="text-sm font-semibold text-primary">
          History
        </h3>
        <p className="text-xs text-muted-foreground">
          {timeline.entries.length} recorded {timeline.entries.length === 1 ? 'event' : 'events'} ·
          times in {DISPLAY_TIME_ZONE_LABEL}
        </p>
      </div>

      {note && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg bg-warning-surface px-3 py-2 text-xs leading-relaxed text-warning"
        >
          <AlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          <p>{note}</p>
        </div>
      )}

      {timeline.entries.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {timeline.gaps.length > 0
            ? 'Nothing can be shown because the history could not be read. Retrying the page may work.'
            : 'No audit entries were recorded for this booking. That is not the same as nothing having happened — parts of the booking lifecycle do not write to the audit log, so use the fields above as the record of state.'}
        </p>
      ) : (
        <ol className="mt-3 space-y-0">
          {timeline.entries.map((entry, index) => (
            <TimelineRow
              key={`${entry.source}:${entry.id}`}
              entry={entry}
              last={index === timeline.entries.length - 1}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * One event. The stored `details`, `reason` and `status` are shown when present
 * and omitted when not — an empty "Reason:" label reads as a reason of "nothing",
 * which is a different claim from none being recorded.
 */
function TimelineRow({ entry, last }: { entry: AdminTimelineEntry; last: boolean }) {
  const undated = entry.atIso === null;

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* The rail, drawn per-row so it stops at the final marker rather than
          trailing into empty space below the list. */}
      {!last && <span aria-hidden="true" className="absolute left-[3px] top-3 h-full w-px bg-hairline" />}
      <span
        aria-hidden="true"
        className={`relative mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full ${
          undated ? 'bg-warning' : 'bg-primary/40'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-xs font-medium text-primary">{formatTimelineKind(entry.kind)}</p>
          <p className={`tabular text-[0.6875rem] ${undated ? 'text-warning' : 'text-muted-foreground'}`}>
            {formatTimelineMoment(entry.atIso)}
          </p>
          <span className="rounded bg-neutral-surface px-1.5 py-px text-[0.625rem] text-primary/60">
            {timelineSourceLabel(entry.source)}
          </span>
        </div>
        {entry.details && (
          <p className="mt-0.5 text-xs leading-relaxed text-primary/70">{entry.details}</p>
        )}
        {entry.reason && (
          <p className="mt-0.5 text-xs leading-relaxed text-primary/70">
            <span className="text-muted-foreground">Reason: </span>
            {entry.reason}
          </p>
        )}
        {entry.status && (
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
            Recorded status: <span className="text-primary/70">{entry.status}</span>
          </p>
        )}
        {entry.actor && (
          <p className="mt-0.5 truncate font-mono text-[0.625rem] text-muted-foreground">
            by {entry.actor}
          </p>
        )}
      </div>
    </li>
  );
}
