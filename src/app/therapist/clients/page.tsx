'use client';

/**
 * Clients — every client this therapist has seen or will see, with their full
 * session history. Built from the bookings the workspace already loaded, so
 * opening it costs no extra reads. Private notes stay on each session's page.
 */
import * as React from 'react';
import Link from 'next/link';
import { Search, ChevronRight, StickyNote } from 'lucide-react';
import { useTherapistData } from '../layout';
import { groupClients, type ClientSummary } from '@/components/therapist/clientHistory';
import { statusBadge, toneClasses } from '@/components/admin/bookings/adminBookingPresentation';
import { formatTime12h } from '@/components/booking/bookingUi';

function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function prettyDate(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export default function TherapistClientsPage() {
  const data = useTherapistData();
  const today = istToday();
  const clients = React.useMemo(() => groupClients(data.bookings, today), [data.bookings, today]);
  const [query, setQuery] = React.useState('');
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => [c.name, c.email, c.phone].some((v) => (v || '').toLowerCase().includes(q)));
  }, [clients, query]);

  const selected = clients.find((c) => c.key === selectedKey) ?? null;

  if (data.loading && data.bookings.length === 0) {
    return <div className="h-40 animate-pulse rounded-xl bg-white shadow-sm" aria-busy="true" />;
  }

  return (
    <section className="space-y-3">
      <div className="border-b border-hairline pb-2.5">
        <h2 className="font-serif text-base font-semibold text-primary">Clients</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {clients.length} {clients.length === 1 ? 'client' : 'clients'} · select one to see every session with them.
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline bg-white px-5 py-8 text-center text-sm text-muted-foreground shadow-sm">
          No clients yet. They appear here after their first paid booking with you.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[20rem_1fr]">
          <div className="space-y-2">
            <label className="relative block">
              <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email or phone"
                aria-label="Search clients"
                className="w-full rounded-lg border border-hairline bg-white py-2 pl-9 pr-3 text-sm"
              />
            </label>
            <ul className="space-y-1.5">
              {filtered.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(c.key)}
                    aria-current={c.key === selectedKey}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-colors ${
                      c.key === selectedKey ? 'border-primary/40 bg-primary/5' : 'border-hairline bg-white hover:bg-primary/5'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-primary">{c.name}</span>
                      <span className="block text-[0.6875rem] text-muted-foreground">
                        {c.completed} completed
                        {c.nextSessionDate ? ` · next ${prettyDate(c.nextSessionDate)}` : c.lastSessionDate ? ` · last ${prettyDate(c.lastSessionDate)}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {c.followUpRecommended && !c.nextSessionDate && (
                        <span className={`rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses('warning')}`}>Follow-up</span>
                      )}
                      <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-1 text-xs text-muted-foreground">No client matches “{query}”.</li>}
            </ul>
          </div>

          {selected ? <ClientDetail client={selected} /> : (
            <div className="hidden items-center justify-center rounded-xl border border-dashed border-hairline bg-white text-sm text-muted-foreground lg:flex">
              Select a client to see their history.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ClientDetail({ client }: { client: ClientSummary }) {
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-white p-4 shadow-sm">
      <div>
        <p className="text-base font-semibold text-primary">{client.name}</p>
        <p className="text-xs text-muted-foreground">
          {[client.email, client.phone, client.age ? `${client.age} yrs` : '', client.gender].filter(Boolean).join(' · ')}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {[
          ['Completed', client.completed],
          ['Upcoming', client.upcoming],
          ['Cancelled', client.cancelled],
          ['No-shows', client.noShow],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-hairline px-3 py-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      {client.followUpRecommended && !client.nextSessionDate && (
        <p className={`rounded-lg px-3 py-2 text-xs ${toneClasses('warning')}`}>
          You recommended a follow-up after the last session and nothing is booked yet.
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-primary">Sessions</p>
        <ol className="space-y-1.5">
          {client.sessions.map((s) => {
            const badge = statusBadge({ status: s.status });
            return (
              <li key={s.id}>
                <Link
                  href={`/therapist/bookings/${encodeURIComponent(s.id)}${s.status === 'completed' ? '#post-session-notes' : ''}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-hairline px-3 py-2 text-xs hover:bg-primary/5"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-primary">{prettyDate(s.date)}</span>
                    <span className="text-muted-foreground"> · {s.time ? formatTime12h(s.time) : ''} · {s.sessionType}</span>
                    {s.followUpStatus && s.followUpStatus !== 'none' && (
                      <span className="text-muted-foreground"> · follow-up {s.followUpStatus}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {s.hasSessionNotes && <StickyNote aria-label="Has private notes" className="h-3.5 w-3.5 text-accent" />}
                    <span className={`rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${toneClasses(badge.tone)}`}>{badge.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[0.6875rem] text-muted-foreground">
          Open a session to read or add your private notes. Notes are never shown to the client.
        </p>
      </div>
    </div>
  );
}
