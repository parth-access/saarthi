'use client';

/**
 * The controls above the table.
 *
 * Two decisions here are about honesty rather than layout:
 *
 *  - **A control the API cannot serve is disabled and says why.** The set of
 *    filter combinations Firestore has an index for is a table in the domain
 *    layer, and `filterAvailability()` reads it. Letting an operator assemble
 *    status + payment and then receive a 400 teaches them the console is
 *    unreliable; disabling it with the reason on the control teaches them how the
 *    data is indexed.
 *  - **Search replaces filters, and the bar shows that.** The API looks a term up
 *    on one field across every booking; it cannot also filter. So typing a term
 *    closes the filters instead of leaving them looking applied.
 *
 * The search box submits on Enter rather than on every keystroke. Each search is
 * a Firestore read and a history entry, and a per-keystroke search would issue
 * seven queries for `ananya` and leave six junk entries behind the Back button.
 */
import { Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  BOOKING_STATUS_GROUPS,
  PAYMENT_STATUS_GROUPS,
  classifyBookingLookup,
  describeBookingLookup,
  isBookingStatusGroupId,
  isPaymentStatusGroupId,
} from '@/domains/booking/queries/adminBookingQuery';
import type { Therapist } from '@/types';
import { filterAvailability, type AdminBookingsView } from './adminBookingsUrlState';

interface BookingsFilterBarProps {
  readonly view: AdminBookingsView;
  readonly therapists: readonly Therapist[];
  readonly therapistsLoading: boolean;
  readonly onChange: (patch: Partial<Omit<AdminBookingsView, 'cursor'>>) => void;
}

const FIELD_CLASSES =
  'h-9 w-full rounded-lg border border-hairline bg-white px-2.5 text-sm text-primary shadow-sm ' +
  'focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30 ' +
  'disabled:cursor-not-allowed disabled:bg-neutral-surface disabled:text-primary/40';

const LABEL_CLASSES =
  'mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-primary/50';

export function BookingsFilterBar({
  view,
  therapists,
  therapistsLoading,
  onChange,
}: BookingsFilterBarProps) {
  const availability = filterAvailability(view);
  const ids = useId();

  // Local so typing is not a query. Re-synced when the URL changes underneath —
  // a Back button press has to be reflected in the box.
  const [term, setTerm] = useState(view.term ?? '');
  useEffect(() => setTerm(view.term ?? ''), [view.term]);

  /**
   * The term the URL has already been asked for.
   *
   * Tracked separately from `view.term` because a navigation is not instant: the
   * clear button and the blur that follows it both see the old `view.term` and
   * would each push the same URL, leaving an entry the Back button has to be
   * pressed twice to get past.
   */
  const submitted = useRef<string | null>(view.term);
  useEffect(() => {
    submitted.current = view.term;
  }, [view.term]);

  const submitSearch = (raw: string) => {
    const trimmed = raw.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next === submitted.current) return;
    submitted.current = next;
    onChange({ term: next });
  };

  const lookup = term.trim().length > 0 ? classifyBookingLookup(term) : null;

  /**
   * The therapist options: the roster, plus the filtered id itself when it is not
   * in the roster. A booking can point at a therapist who has since been removed,
   * and dropping that id from the select would silently clear the filter.
   */
  const therapistIds = new Set(therapists.map((therapist) => therapist.id));
  const orphanTherapistId =
    view.therapistId && !therapistIds.has(view.therapistId) ? view.therapistId : null;

  return (
    <section
      aria-label="Filter bookings"
      className="rounded-xl border border-hairline bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label className={LABEL_CLASSES} htmlFor={`${ids}-q`}>
            Find one booking
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary/40"
            />
            <input
              id={`${ids}-q`}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitSearch(term);
                }
              }}
              onBlur={() => {
                // Clearing the box should clear the search without a keystroke.
                if (term.trim().length === 0) submitSearch('');
              }}
              placeholder="Booking id, email, phone, order id, or name"
              aria-describedby={`${ids}-q-help`}
              className={`${FIELD_CLASSES} pl-8 pr-8`}
            />
            {term.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTerm('');
                  submitSearch('');
                }}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-primary/40 hover:bg-neutral-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p id={`${ids}-q-help`} className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground">
            {lookup
              ? `Press Enter to search. ${describeBookingLookup(lookup)}`
              : 'Searches one field exactly — there is no partial-text search across bookings.'}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-hairline pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={LABEL_CLASSES} htmlFor={`${ids}-status`}>
            Status
          </label>
          <select
            id={`${ids}-status`}
            className={FIELD_CLASSES}
            value={view.statusGroup ?? ''}
            disabled={!availability.status.enabled}
            title={availability.status.reason || undefined}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ statusGroup: isBookingStatusGroupId(value) ? value : null });
            }}
          >
            <option value="">Any status</option>
            {BOOKING_STATUS_GROUPS.map((group) => (
              <option key={group.id} value={group.id} title={group.meaning}>
                {group.label}
              </option>
            ))}
          </select>
          <FieldNote reason={availability.status.reason} />
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`${ids}-payment`}>
            Payment
          </label>
          <select
            id={`${ids}-payment`}
            className={FIELD_CLASSES}
            value={view.paymentGroup ?? ''}
            disabled={!availability.paymentStatus.enabled}
            title={availability.paymentStatus.reason || undefined}
            onChange={(event) => {
              const value = event.target.value;
              onChange({ paymentGroup: isPaymentStatusGroupId(value) ? value : null });
            }}
          >
            <option value="">Any payment state</option>
            {PAYMENT_STATUS_GROUPS.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
          <FieldNote reason={availability.paymentStatus.reason} />
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`${ids}-therapist`}>
            Therapist
          </label>
          <select
            id={`${ids}-therapist`}
            className={FIELD_CLASSES}
            value={view.therapistId ?? ''}
            disabled={!availability.therapistId.enabled}
            title={availability.therapistId.reason || undefined}
            onChange={(event) => onChange({ therapistId: event.target.value || null })}
          >
            <option value="">Any therapist</option>
            {therapists.map((therapist) => (
              <option key={therapist.id} value={therapist.id}>
                {therapist.name}
              </option>
            ))}
            {orphanTherapistId && (
              <option value={orphanTherapistId}>{orphanTherapistId} (not in roster)</option>
            )}
          </select>
          <FieldNote
            reason={
              availability.therapistId.reason ||
              (therapistsLoading ? 'Loading the therapist roster…' : '')
            }
          />
        </div>

        <div>
          <label className={LABEL_CLASSES} htmlFor={`${ids}-date`}>
            Session date
          </label>
          <input
            id={`${ids}-date`}
            type="date"
            className={FIELD_CLASSES}
            value={view.date ?? ''}
            disabled={!availability.date.enabled}
            title={availability.date.reason || undefined}
            onChange={(event) => onChange({ date: event.target.value || null })}
          />
          <FieldNote reason={availability.date.reason || 'The day of the session, not of booking.'} />
        </div>
      </div>
    </section>
  );
}

function FieldNote({ reason }: { reason: string }) {
  if (!reason) return null;
  return <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground">{reason}</p>;
}
