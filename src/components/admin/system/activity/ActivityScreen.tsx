'use client';

/**
 * The Activity log: who did what, and what the system did in response — one
 * filter axis at a time, exactly as the server's query plan allows.
 *
 * This is an operational audit surface, not a raw Firestore dump: rows show
 * what happened, who or what acted (typed, not named — person-level identity
 * lives in the audit entries on each booking), and the references that connect
 * a row to the booking, payment or email it was about. The per-booking audit
 * trail remains on the booking detail screen; this is the cross-booking stream.
 */
import * as React from 'react';
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  ACTIVITY_ACTOR_TYPES,
  ACTIVITY_SEVERITIES,
  ACTIVITY_SOURCES,
  type ActivityFilter,
  type ActivitySource,
} from '@/domains/admin/activityQuery';
import { severityBadge } from '@/domains/admin/operationsTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { useAdminActivity } from './useAdminActivity';

type FilterKind = ActivityFilter['kind'] | 'none';

const SOURCE_LABELS: Record<ActivitySource, string> = {
  timeline: 'System events',
  audit: 'Admin audit trail',
};

const TIMELINE_FILTER_LABELS: Record<string, string> = {
  correlationId: 'Correlation id',
  bookingId: 'Booking id',
  severity: 'Severity',
  event: 'Event',
  actorType: 'Actor',
};

const AUDIT_FILTER_LABELS: Record<string, string> = {
  eventType: 'Event type',
  userId: 'Actor id',
};

export function ActivityScreen() {
  const [source, setSource] = useState<ActivitySource>('timeline');
  const [filterKind, setFilterKind] = useState<FilterKind>('none');
  const [filterValue, setFilterValue] = useState('');
  const [filter, setFilter] = useState<ActivityFilter | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activity = useAdminActivity(filter, source);

  function switchSource(next: ActivitySource) {
    if (next === source) return;
    // The two ledgers have different filter vocabularies; carrying a filter
    // across would silently mean something else.
    setSource(next);
    setFilterKind('none');
    setFilterValue('');
    setFilter(null);
  }

  function applyFilter() {
    const value = filterValue.trim();
    if (filterKind === 'none' || !value) {
      setFilter(null);
      return;
    }
    setFilter({ kind: filterKind, value } as ActivityFilter);
  }

  function clearFilter() {
    setFilterKind('none');
    setFilterValue('');
    setFilter(null);
  }

  return (
    <div className="space-y-3">
      <Reading
        loading={activity.loading}
        onReload={activity.reload}
        generatedAtIso={activity.generatedAtIso}
      />

      {activity.error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {activity.error}
        </Notice>
      )}

      <SourceToggle source={source} onSource={switchSource} />

      <FilterPanel
        source={source}
        filterKind={filterKind}
        onKind={(kind) => {
          setFilterKind(kind);
          setFilterValue('');
        }}
        filterValue={filterValue}
        onValue={setFilterValue}
        onApply={applyFilter}
        onClear={clearFilter}
        activeFilter={filter}
      />

      {activity.failed && (
        <Notice tone="danger">
          <span className="font-medium">{activity.failedReason}</span> This is missing, not empty.
          Do not read it as nothing having happened.
        </Notice>
      )}

      {activity.initialLoading ? (
        <ActivitySkeleton />
      ) : activity.entries.length === 0 && !activity.failed && !activity.error ? (
        <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-primary/70">
              {filter
                ? 'No activity matches this filter in what was read. This is a real empty for this query, not a failed read.'
                : 'No activity in what was read. Rows are written by events — a platform with no traffic shows nothing here, and so does a failed read: reload to tell the two apart.'}
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {activity.entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onCorrelation={(id) => {
                setFilterKind('correlationId');
                setFilterValue(id);
                setFilter({ kind: 'correlationId', value: id });
              }}
              onBooking={(id) => {
                setFilterKind('bookingId');
                setFilterValue(id);
                setFilter({ kind: 'bookingId', value: id });
              }}
            />
          ))}
        </ul>
      )}

      {activity.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={activity.loadMore} disabled={activity.loadingMore}>
            {activity.loadingMore ? 'Reading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header + filters
 * ------------------------------------------------------------------ */

function Reading({
  loading,
  onReload,
  generatedAtIso,
}: {
  loading: boolean;
  onReload: () => void;
  generatedAtIso: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Activity log</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {generatedAtIso
            ? `Read at ${formatCreatedAt(generatedAtIso)} ${DISPLAY_TIME_ZONE_LABEL}. This page does not refresh on its own.`
            : 'Reading…'}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reading…' : 'Read again'}
      </Button>
    </div>
  );
}

function SourceToggle({
  source,
  onSource,
}: {
  source: ActivitySource;
  onSource: (source: ActivitySource) => void;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Activity ledger">
        {ACTIVITY_SOURCES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={source === value}
            onClick={() => onSource(value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              source === value
                ? 'bg-primary text-white'
                : 'bg-neutral-surface text-primary/70 hover:text-primary'
            }`}
          >
            {SOURCE_LABELS[value]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[0.625rem] leading-relaxed text-muted-foreground">
        {source === 'timeline'
          ? 'What the system did as events fired — booking, payment, email and reminder flows. Rows without a filter are the newest first.'
          : 'The durable audit trail: role and access changes, bookability switches, slot holds, payments and refunds. Rows here were written at the moment the change was made.'}
      </p>
    </div>
  );
}

function FilterPanel({
  source,
  filterKind,
  onKind,
  filterValue,
  onValue,
  onApply,
  onClear,
  activeFilter,
}: {
  source: ActivitySource;
  filterKind: FilterKind;
  onKind: (kind: FilterKind) => void;
  filterValue: string;
  onValue: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  activeFilter: ActivityFilter | null;
}) {
  const fieldClass =
    'rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20';
  const isTimeline = source === 'timeline';
  const labels = isTimeline ? TIMELINE_FILTER_LABELS : AUDIT_FILTER_LABELS;
  const selectKind = isTimeline && (filterKind === 'severity' || filterKind === 'actorType');

  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-primary">
        Filter — one axis at a time, the way the log is indexed
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={filterKind}
          onChange={(event) => onKind(event.target.value as FilterKind)}
          aria-label="Filter axis"
          className={fieldClass}
        >
          <option value="none">No filter</option>
          {(Object.keys(labels) as Array<Exclude<FilterKind, 'none'>>).map((kind) => (
            <option key={kind} value={kind}>
              {labels[kind]}
            </option>
          ))}
        </select>
        {filterKind !== 'none' &&
          (selectKind ? (
            <select
              value={filterValue}
              onChange={(event) => onValue(event.target.value)}
              aria-label="Filter value"
              className={fieldClass}
            >
              <option value="">Choose…</option>
              {(filterKind === 'severity' ? ACTIVITY_SEVERITIES : ACTIVITY_ACTOR_TYPES).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="search"
              value={filterValue}
              onChange={(event) => onValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onApply();
              }}
              placeholder={
                filterKind === 'event'
                  ? 'e.g. BookingConfirmed'
                  : filterKind === 'eventType'
                    ? 'e.g. PAYMENT_SUCCEEDED'
                    : 'id'
              }
              aria-label="Filter value"
              className={`min-w-0 flex-1 ${fieldClass}`}
            />
          ))}
        <Button size="sm" onClick={onApply} disabled={filterKind === 'none' || filterValue.trim().length === 0}>
          Apply
        </Button>
        {activeFilter && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {activeFilter && (
        <p className="mt-2 text-[0.625rem] text-muted-foreground">
          Filtering by {labels[activeFilter.kind as Exclude<FilterKind, 'none'>]}:{' '}
          <span className="font-mono">{activeFilter.value}</span>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One entry
 * ------------------------------------------------------------------ */

function EntryCard({
  entry,
  expanded,
  onToggle,
  onCorrelation,
  onBooking,
}: {
  entry: import('@/app/api/admin/activity/activitySources').ActivityEntry;
  expanded: boolean;
  onToggle: () => void;
  onCorrelation: (id: string) => void;
  onBooking: (id: string) => void;
}) {
  const severity = severityBadge(entry.severity ?? 'info');

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {expanded ? (
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {entry.severity === null ? (
          <Badge
            tone="info"
            label="Audit"
            title="A durable audit row — written at the moment the change was made."
          />
        ) : (
          <Badge {...severity} label={severity.label} title="Severity as written by the event." />
        )}
        <span className="font-mono text-xs text-primary">{entry.event}</span>
        <span className="text-[0.6875rem] text-muted-foreground">
          Actor: {entry.actorType ?? entry.actorId ?? 'system'}
        </span>
        {entry.createdAtIso && (
          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
            {formatCreatedAt(entry.createdAtIso)}
          </span>
        )}
      </button>

      {entry.message && (
        <p className="mt-1.5 pl-6 text-xs leading-relaxed text-primary/80">{entry.message}</p>
      )}

      {(entry.correlationId || entry.bookingId) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
          {entry.correlationId && (
            <button
              type="button"
              onClick={() => onCorrelation(entry.correlationId as string)}
              className="rounded bg-info-surface px-2 py-0.5 font-mono text-[0.625rem] text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title="Filter the log to this correlation"
            >
              correlation: {entry.correlationId}
            </button>
          )}
          {entry.bookingId && (
            <>
              <button
                type="button"
                onClick={() => onBooking(entry.bookingId as string)}
                className="rounded bg-neutral-surface px-2 py-0.5 font-mono text-[0.625rem] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Filter the log to this booking"
              >
                booking: {entry.bookingId}
              </button>
              <Link
                href={`/admin/bookings/${encodeURIComponent(entry.bookingId)}`}
                className="text-[0.625rem] font-medium text-primary underline-offset-2 hover:underline"
              >
                open booking
              </Link>
            </>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-2 border-t border-hairline pt-2 pl-6 text-[0.6875rem] leading-relaxed text-muted-foreground">
          <p>
            Actor id: <span className="font-mono">{entry.actorId ?? '—'}</span>
            {entry.paymentId && (
              <>
                {' '}
                · payment: <span className="font-mono">{entry.paymentId}</span>
              </>
            )}
            {entry.emailId && (
              <>
                {' '}
                · email: <span className="font-mono">{entry.emailId}</span>
              </>
            )}
          </p>
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-surface px-2.5 py-2 font-mono text-[0.625rem] text-primary/80">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Badge({ label, tone, title }: { label: string; tone: AdminTone; title: string }) {
  return (
    <span
      title={title}
      className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(tone)}`}
    >
      {label}
    </span>
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

function ActivitySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <p className="sr-only">Loading the activity log…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
