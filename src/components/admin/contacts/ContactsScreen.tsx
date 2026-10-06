'use client';

/**
 * The Contacts & inquiries screen: what people wrote through the website form,
 * handled honestly as a triage list.
 *
 * Parity with the legacy panel, restated in this console's rules:
 *  - Status transitions are exactly the three the legacy console offered
 *    (resolve, mark unread, mark spam). `in-progress` exists in the schema and
 *    is shown if stored, but no button sets it — this migration does not invent
 *    a workflow the backend does not have.
 *  - There is NO reply capability. Replies happen in the operator's own mail
 *    client; the screen provides the mailto link and says so rather than
 *    implying the platform sent something.
 *  - Reads and writes go through the admin API — the legacy panel wrote this
 *    collection from the browser with the client SDK.
 *  - Delete is destructive and says what it destroys. Filters see only loaded
 *    pages, and say that too.
 */
import * as React from 'react';
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  CONTACT_FILTER_BOUND,
  contactStatusBadge,
  filterContacts,
  messagePreview,
  type ContactRow,
} from '@/domains/admin/contactTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../bookings/adminBookingPresentation';
import { ConfirmDialog } from '../ConfirmDialog';
import { interpretContactMutationResponse } from './adminContactsResponse';
import { useAdminContacts } from './useAdminContacts';

interface MutationBanner {
  readonly tone: AdminTone;
  readonly text: string;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'spam', label: 'Spam' },
] as const;

export function ContactsScreen() {
  const { rows, loading, initialLoading, loadingMore, hasMore, error, generatedAtIso, failed, failedReason, reload, loadMore } =
    useAdminContacts();
  const [statusFilter, setStatusFilter] = useState('all');
  const [term, setTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<MutationBanner | null>(null);

  if (initialLoading) return <ContactsSkeleton />;
  if (!generatedAtIso && !error) return <ContactsSkeleton />;

  const visible = filterContacts(rows, statusFilter, term);
  const filtered = statusFilter !== 'all' || term.trim().length > 0;
  const unreadCount = rows.filter((row) => row.status === 'unread').length;

  async function setContactStatus(row: ContactRow, status: string) {
    if (mutatingId) return;
    setMutatingId(row.id);
    try {
      const response = await fetchWithAuth(`/api/admin/contacts/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      let parsed: unknown = null;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }
      const result = interpretContactMutationResponse(response.status, parsed);
      setBanner(
        result.ok
          ? { tone: 'success', text: 'The inquiry was updated. Reload to see it settle.' }
          : { tone: 'warning', text: result.error }
      );
      if (result.ok) reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so the inquiry may or may not have changed. Reload before doing anything else.',
      });
    } finally {
      setMutatingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const response = await fetchWithAuth(
        `/api/admin/contacts/${encodeURIComponent(deleteTarget.id)}`,
        { method: 'DELETE' }
      );
      let parsed: unknown = null;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }
      const result = interpretContactMutationResponse(response.status, parsed);
      setBanner(
        result.ok
          ? { tone: 'success', text: 'The inquiry was deleted. Reload to see it settle.' }
          : { tone: 'warning', text: result.error }
      );
      setDeleteTarget(null);
      if (result.ok) reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so the inquiry may or may not have been deleted. Reload before doing anything else.',
      });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <Reading
        loading={loading}
        onReload={reload}
        generatedAtIso={generatedAtIso}
        unreadCount={unreadCount}
      />

      {error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error}
          {generatedAtIso && (
            <>
              {' '}
              What you see below was read at {formatCreatedAt(generatedAtIso)}{' '}
              {DISPLAY_TIME_ZONE_LABEL}.
            </>
          )}
        </Notice>
      )}

      {banner && (
        <Notice tone={banner.tone}>
          <span className="font-medium">Inquiry: </span>
          {banner.text}
        </Notice>
      )}

      {failed && (
        <Notice tone="danger">
          <span className="font-medium">{failedReason}</span> This page is missing, not empty. Do
          not read it as no inquiries having arrived.
        </Notice>
      )}

      <DrivenBy />

      <Filters statusFilter={statusFilter} onStatus={setStatusFilter} term={term} onTerm={setTerm} />

      {visible.length === 0 && !filtered ? (
        <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-primary/70">
              No inquiries in what has been read. This is a real empty, not a failed read — the
              contact form writes here when the next one arrives.
            </p>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-white px-4 py-3 text-xs text-muted-foreground shadow-sm">
          Nothing matches these filters. {CONTACT_FILTER_BOUND}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((row) => (
            <ContactCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              busy={mutatingId === row.id}
              onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
              onStatus={(status) => setContactStatus(row, status)}
              onDelete={() => setDeleteTarget(row)}
            />
          ))}
        </ul>
      )}

      {filtered && (
        <p className="text-[0.625rem] leading-relaxed text-muted-foreground">{CONTACT_FILTER_BOUND}</p>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Reading…' : 'Load more'}
          </Button>
        </div>
      )}

      {deleteTarget && (
        <DeleteDialog
          row={deleteTarget}
          busy={deleting}
          onConfirm={confirmDelete}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

function Reading({
  loading,
  onReload,
  generatedAtIso,
  unreadCount,
}: {
  loading: boolean;
  onReload: () => void;
  generatedAtIso: string | null;
  unreadCount: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Contacts &amp; inquiries</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {generatedAtIso
            ? `Read at ${formatCreatedAt(generatedAtIso)} ${DISPLAY_TIME_ZONE_LABEL}. This page does not refresh on its own.`
            : 'Reading…'}
          {unreadCount > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-info-surface px-2 py-0.5 text-[0.6875rem] font-medium text-info">
              <span className="tabular-nums">{unreadCount}</span> unread of what was read
            </span>
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
        <RotateCcw aria-hidden="true" className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Reading…' : 'Read again'}
      </Button>
    </div>
  );
}

function DrivenBy() {
  return (
    <p className="rounded-xl border border-hairline bg-neutral-surface px-4 py-2.5 text-xs leading-relaxed text-primary/70">
      <span className="font-medium text-primary">Replies are not sent from here.</span> The platform
      acknowledges every inquiry automatically when it arrives; answering it is done from your own
      mail client — the email link opens one. Status here is a triage note, not a conversation.
    </p>
  );
}

function Filters({
  statusFilter,
  onStatus,
  term,
  onTerm,
}: {
  statusFilter: string;
  onStatus: (value: string) => void;
  term: string;
  onTerm: (value: string) => void;
}) {
  const fieldClass =
    'rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={statusFilter}
        onChange={(event) => onStatus(event.target.value)}
        aria-label="Filter by status"
        className={fieldClass}
      >
        {STATUS_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="search"
        value={term}
        onChange={(event) => onTerm(event.target.value)}
        placeholder="Search name, email, message…"
        aria-label="Search the read pages"
        className={`min-w-0 flex-1 ${fieldClass}`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One inquiry
 * ------------------------------------------------------------------ */

function ContactCard({
  row,
  expanded,
  busy,
  onToggle,
  onStatus,
  onDelete,
}: {
  row: ContactRow;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (status: string) => void;
  onDelete: () => void;
}) {
  const badge = contactStatusBadge(row.status);
  const unread = row.status === 'unread';

  return (
    <li
      className={`rounded-xl border bg-white p-3.5 shadow-sm ${unread ? 'border-info/30' : 'border-hairline'}`}
    >
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
        <Badge {...badge} />
        {row.priority === 'high' && (
          <Badge tone="danger" label="High priority" title="Flagged high in the stored record." />
        )}
        <span className="text-xs font-medium text-primary">{row.name || 'Name not read'}</span>
        {row.createdAtIso && (
          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
            {formatCreatedAt(row.createdAtIso)}
          </span>
        )}
      </button>

      <p className="mt-1.5 pl-6 text-xs leading-relaxed text-primary/80">
        {expanded ? row.message : messagePreview(row.message) || 'No message stored.'}
      </p>

      <div className="mt-1 pl-6 text-[0.6875rem] text-muted-foreground">
        {row.email ? row.email : 'No email stored.'}
        {row.source && <span> · via {row.source}</span>}
      </div>

      {expanded && (
        <div className="mt-2 pl-6 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {row.email ? (
            <a
              href={`mailto:${row.email}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Reply from your mail client
            </a>
          ) : (
            'No email stored.'
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
        {row.status !== 'resolved' && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onStatus('resolved')}
          >
            Resolve
          </Button>
        )}
        {row.status !== 'unread' && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStatus('unread')}>
            Mark unread
          </Button>
        )}
        {row.status !== 'spam' && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStatus('spam')}>
            Mark spam
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onDelete}
          className="ml-auto text-danger hover:bg-danger-surface"
        >
          <Trash2 aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Dialog
 * ------------------------------------------------------------------ */

function DeleteDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: ContactRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Delete this inquiry?"
      subtitle={row.email || row.name || undefined}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>
          This removes the inquiry permanently — the message, the sender and any record of it leave
          the platform. A deletion is not recoverable from this console.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <ChevronRight aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            If the inquiry only needs to stop being counted as work, marking it resolved or spam
            keeps the record.
          </span>
        </p>
      </div>
    </ConfirmDialog>
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

function ContactsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading inquiries…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-10 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
