'use client';

/**
 * The Users & roles screen: accounts, their roles, and access revocation.
 *
 * This section has no legacy ancestor — role changes previously happened only
 * by direct database edits, invisible and unaudited. Everything here is new
 * capability, so its copy has to carry the weight: what each change does, what
 * it does not do, and where the platform enforces it.
 *
 *  - The role vocabulary is the platform's closed set (admin, therapist,
 *    client). No fourth role can be invented here.
 *  - An administrator cannot mutate their own account from this screen, and
 *    the server refuses it too.
 *  - The last administrator cannot be demoted or disabled — the server counts
 *    other admins before writing.
 *  - Revocation has two levers: revoking sessions kills existing cookies;
 *    disabling also refuses future sign-ins. Both are enforced by
 *    verifySession and the session-mint endpoint, not by this page believing
 *    it.
 *  - Accounts missing a creation timestamp never appear in the paged list
 *    (Firestore ordering drops them); exact-email lookup reaches every
 *    account, and the screen says so.
 */
import * as React from 'react';
import { useState } from 'react';
import { CheckCircle2, RotateCcw, Search } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetchWithAuth';
import { Button } from '@/components/ui/Button';
import type { AdminTone } from '@/domains/booking/queries/adminBookingQuery';
import {
  USER_ROLES,
  USER_ROLE_LABELS,
  userRoleBadge,
  type UserRole,
  type UsersRow,
} from '@/domains/admin/usersTriage';
import {
  DISPLAY_TIME_ZONE_LABEL,
  formatCreatedAt,
  toneClasses,
} from '../../bookings/adminBookingPresentation';
import { ConfirmDialog } from '../../ConfirmDialog';
import { interpretUserMutationResponse } from './adminUsersResponse';
import { useAdminUsers } from './useAdminUsers';

interface MutationBanner {
  readonly tone: AdminTone;
  readonly text: string;
}

type DialogTarget =
  | { kind: 'role'; row: UsersRow }
  | { kind: 'revoke'; row: UsersRow }
  | { kind: 'disable'; row: UsersRow }
  | { kind: 'enable'; row: UsersRow };

const ROLE_FILTERS: ReadonlyArray<{ value: UserRole | 'all'; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Administrators' },
  { value: 'therapist', label: 'Therapists' },
  { value: 'client', label: 'Clients' },
];

const ROLE_CONSEQUENCES: Readonly<Record<UserRole, string>> = {
  admin:
    'Grants full console access: every booking, payment and refund operation, plus this screen and every system section.',
  therapist:
    'Grants the therapist app — schedule, sessions, notes. No console access.',
  client: 'Booking access only. No console, no therapist app.',
};

export function UsersScreen() {
  const {
    rows,
    selfUid,
    generatedAtIso,
    administrators,
    roleFilter,
    setRoleFilter,
    loading,
    initialLoading,
    loadingMore,
    hasMore,
    error,
    stale,
    failed,
    failedReason,
    reload,
    loadMore,
    lookup,
    runLookup,
    clearLookup,
  } = useAdminUsers();

  const [banner, setBanner] = useState<MutationBanner | null>(null);
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [mutating, setMutating] = useState(false);
  const [lookupEmail, setLookupEmail] = useState('');

  if (initialLoading) return <UsersSkeleton />;
  if (!generatedAtIso && !error) return <UsersSkeleton />;

  async function performAction(row: UsersRow, body: Record<string, unknown>) {
    if (mutating) return;
    setMutating(true);
    try {
      const response = await fetchWithAuth(`/api/admin/users/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      let parsed: unknown = null;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }
      const result = interpretUserMutationResponse(response.status, parsed);
      setBanner(
        result.ok
          ? { tone: 'success', text: result.summary }
          : { tone: 'warning', text: result.error }
      );
      setDialog(null);
      if (result.ok && result.changed) reload();
    } catch {
      setBanner({
        tone: 'warning',
        text: 'The request did not complete, so the account may or may not have changed. Reload before doing anything else.',
      });
      setDialog(null);
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="space-y-3">
      <Reading
        loading={loading}
        onReload={reload}
        generatedAtIso={generatedAtIso}
        administrators={administrators}
      />

      {stale && error && (
        <Notice tone="warning">
          <span className="font-medium">This did not refresh.</span> {error} What you see below was
          read at {formatCreatedAt(generatedAtIso ?? new Date(0).toISOString())}{' '}
          {DISPLAY_TIME_ZONE_LABEL}.
        </Notice>
      )}

      {banner && (
        <Notice tone={banner.tone}>
          <span className="font-medium">Account: </span>
          {banner.text}
        </Notice>
      )}

      {failed && (
        <Notice tone="danger">
          <span className="font-medium">{failedReason}</span> This page is missing, not empty. Do
          not read it as there being no accounts.
        </Notice>
      )}

      <DrivenBy />

      <RoleFilterBar value={roleFilter} onChange={setRoleFilter} />

      <LookupPanel
        email={lookupEmail}
        onEmail={setLookupEmail}
        lookup={lookup}
        selfUid={selfUid}
        onRun={() => runLookup(lookupEmail)}
        onClear={clearLookup}
        onAction={(kind, row) => setDialog({ kind, row })}
        mutating={mutating}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-white p-4 shadow-sm">
          <div className="flex items-start gap-2.5 rounded-lg bg-neutral-surface px-3 py-2.5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-xs leading-relaxed text-primary/70">
              No accounts in what has been read for this filter. This is a real empty, not a failed
              read — an account missing a creation timestamp would not appear here either; find it
              by exact email above.
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <UserCard
              key={row.id}
              row={row}
              self={row.id === selfUid}
              busy={mutating}
              onAction={(kind) => setDialog({ kind, row })}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Reading…' : 'Load more'}
          </Button>
        </div>
      )}

      {dialog?.kind === 'role' && (
        <RoleDialog
          row={dialog.row}
          busy={mutating}
          onConfirm={(role) => performAction(dialog.row, { action: 'setRole', role })}
          onClose={() => {
            if (!mutating) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeDialog
          row={dialog.row}
          busy={mutating}
          onConfirm={() => performAction(dialog.row, { action: 'revokeSessions' })}
          onClose={() => {
            if (!mutating) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'disable' && (
        <DisableDialog
          row={dialog.row}
          busy={mutating}
          onConfirm={() => performAction(dialog.row, { action: 'disableAccount' })}
          onClose={() => {
            if (!mutating) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'enable' && (
        <EnableDialog
          row={dialog.row}
          busy={mutating}
          onConfirm={() => performAction(dialog.row, { action: 'enableAccount' })}
          onClose={() => {
            if (!mutating) setDialog(null);
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
  administrators,
}: {
  loading: boolean;
  onReload: () => void;
  generatedAtIso: string | null;
  administrators: ReturnType<typeof useAdminUsers>['administrators'];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-hairline bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">Accounts, roles and access</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {generatedAtIso
            ? `Read at ${formatCreatedAt(generatedAtIso)} ${DISPLAY_TIME_ZONE_LABEL}. This page does not refresh on its own.`
            : 'Reading…'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {administrators === null ? null : administrators.ok ? (
            <span className="inline-flex items-center rounded-full bg-info-surface px-2 py-0.5 text-[0.6875rem] font-medium text-info">
              <span className="tabular-nums">{administrators.count}</span>{' '}
              {administrators.count === 1 ? 'administrator' : 'administrators'} in total
            </span>
          ) : (
            <span className="text-warning">{administrators.reason}</span>
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
      <span className="font-medium text-primary">The platform enforces these changes, not this
      page.</span> The role is re-read from the account document on every request, a revocation mark
      rejects older sessions outright, and a disabled account is refused a new session at sign-in.
      Existing bookings, payments and history are never touched by any of it.
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Filter + lookup
 * ------------------------------------------------------------------ */

function RoleFilterBar({
  value,
  onChange,
}: {
  value: UserRole | 'all';
  onChange: (role: UserRole | 'all') => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as UserRole | 'all')}
        aria-label="Filter by role"
        className="rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {ROLE_FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="text-[0.625rem] leading-relaxed text-muted-foreground">
        The role filter is applied by the server over the whole collection — not just the pages
        loaded here.
      </span>
    </div>
  );
}

function LookupPanel({
  email,
  onEmail,
  lookup,
  selfUid,
  onRun,
  onClear,
  onAction,
  mutating,
}: {
  email: string;
  onEmail: (value: string) => void;
  lookup: ReturnType<typeof useAdminUsers>['lookup'];
  selfUid: string;
  onRun: () => void;
  onClear: () => void;
  onAction: (kind: 'role' | 'revoke' | 'disable' | 'enable', row: UsersRow) => void;
  mutating: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onRun();
        }}
      >
        <label htmlFor="user-lookup-email" className="text-xs font-medium text-primary">
          Find by exact email
        </label>
        <input
          id="user-lookup-email"
          type="email"
          value={email}
          onChange={(event) => onEmail(event.target.value)}
          placeholder="person@example.com"
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button type="submit" variant="outline" size="sm" disabled={lookup.status === 'loading' || !email.trim()}>
          <Search aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
          {lookup.status === 'loading' ? 'Looking…' : 'Look up'}
        </Button>
      </form>
      <p className="mt-1.5 text-[0.625rem] leading-relaxed text-muted-foreground">
        Exact match only. This is also the path that reaches accounts missing a creation timestamp,
        which the paged list cannot show.
      </p>

      {lookup.status === 'done' &&
        (lookup.rows.length === 0 ? (
          <p className="mt-2 rounded-lg bg-neutral-surface px-3 py-2 text-xs text-primary/70">
            No account has that exact email. This is a real empty, not a failed read.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[0.6875rem] text-muted-foreground">
                Read at {formatCreatedAt(lookup.generatedAtIso ?? new Date(0).toISOString())}{' '}
                {DISPLAY_TIME_ZONE_LABEL}
              </p>
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear
              </Button>
            </div>
            <ul className="space-y-2">
              {lookup.rows.map((row) => (
                <UserCard
                  key={row.id}
                  row={row}
                  self={row.id === selfUid}
                  busy={mutating}
                  onAction={(kind) => onAction(kind, row)}
                />
              ))}
            </ul>
          </div>
        ))}
      {lookup.status === 'error' && (
        <p className="mt-2 rounded-lg bg-warning-surface px-3 py-2 text-xs text-warning" role="alert">
          {lookup.error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One account
 * ------------------------------------------------------------------ */

function UserCard({
  row,
  self,
  busy,
  onAction,
}: {
  row: UsersRow;
  self: boolean;
  busy: boolean;
  onAction: (kind: 'role' | 'revoke' | 'disable' | 'enable') => void;
}) {
  const badge = userRoleBadge(row.role);
  const revokedIso = row.sessionRevokeBeforeSeconds
    ? new Date(row.sessionRevokeBeforeSeconds * 1000).toISOString()
    : null;

  return (
    <li className="rounded-xl border border-hairline bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge {...badge} title={`Role stored on the account: ${row.role}`} />
        {row.accountDisabled && (
          <Badge tone="danger" label="Disabled" title="New sign-ins are refused for this account." />
        )}
        {revokedIso && (
          <Badge
            tone="warning"
            label="Sessions revoked"
            title={`Sessions issued before ${formatCreatedAt(revokedIso)} are rejected.`}
          />
        )}
        {self && <Badge tone="info" label="You" title="This is the account you are signed in as." />}
        <span className="text-xs font-medium text-primary">{row.name || 'Name not read'}</span>
        {row.createdAtIso && (
          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
            Joined {formatCreatedAt(row.createdAtIso)}
          </span>
        )}
      </div>

      <div className="mt-1 text-[0.6875rem] text-muted-foreground">
        {row.email || 'No email stored.'}
        {row.provider && <span> · via {row.provider}</span>}
        <span> · id {row.id}</span>
      </div>

      {self ? (
        <p className="mt-2.5 border-t border-hairline pt-2.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          This is your account. The server refuses role and access changes to the signed-in
          administrator, so its controls are not offered here.
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline pt-2.5">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction('role')}>
            Change role
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction('revoke')}>
            Revoke sessions
          </Button>
          {row.accountDisabled ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction('enable')}>
              Enable account
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onAction('disable')}
              className="ml-auto text-danger hover:bg-danger-surface"
            >
              Disable account
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

function RoleDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: UsersRow;
  busy: boolean;
  onConfirm: (role: UserRole) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<UserRole>(
    (USER_ROLES as readonly string[]).includes(row.role) ? (row.role as UserRole) : 'client'
  );
  const demotingLastAdminRisk = row.role === 'admin' && choice !== 'admin';

  return (
    <ConfirmDialog
      title="Change this account's role?"
      subtitle={`${row.name || row.email || row.id} — ${userRoleBadge(row.role).label} now`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onConfirm(choice)}
            disabled={busy || choice === row.role}
          >
            {busy ? 'Writing…' : `Make ${USER_ROLE_LABELS[choice]}`}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <div>
          <label htmlFor="role-choice" className="font-medium">
            New role
          </label>
          <select
            id="role-choice"
            value={choice}
            onChange={(event) => setChoice(event.target.value as UserRole)}
            className="mt-1 w-full rounded-lg border border-hairline bg-white px-2.5 py-1.5 text-xs text-primary focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <p>{ROLE_CONSEQUENCES[choice]}</p>
        <p>
          Takes effect on the person’s next request — pages they already have open keep rendering,
          but every action re-checks the role.
        </p>
        {demotingLastAdminRisk && (
          <p className="flex items-start gap-1.5 text-warning">
            <span aria-hidden="true">▲</span>
            <span>
              This account is an administrator. The change is refused if it holds the last
              administrator role on the platform.
            </span>
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}

function RevokeDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: UsersRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Revoke this account's sessions?"
      subtitle={row.email || row.name || row.id}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Revoking…' : 'Revoke sessions'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>
          Every session issued before now is rejected on this person’s next request — signed-in
          browsers lose access the moment they act. Use this when a device or cookie is compromised
          but the account itself is trusted.
        </p>
        <p className="flex items-start gap-1.5 text-warning">
          <span aria-hidden="true">▲</span>
          <span>They can sign in again immediately. If the account itself must lose access, disable it instead.</span>
        </p>
      </div>
    </ConfirmDialog>
  );
}

function DisableDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: UsersRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Disable this account?"
      subtitle={`${row.name || row.email || row.id} — ${userRoleBadge(row.role).label}`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Disabling…' : 'Disable account'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>
          Two things happen at once: existing sessions are rejected from now on, and new sign-ins
          are refused at session creation. This is the strongest access revocation the console
          offers.
        </p>
        <p>
          The account’s data — bookings, payment history, notes — is untouched, and an
          administrator can re-enable the account at any time.
        </p>
        {row.role === 'admin' && (
          <p className="flex items-start gap-1.5 text-warning">
            <span aria-hidden="true">▲</span>
            <span>
              This account is an administrator. The change is refused if it holds the last
              administrator role on the platform.
            </span>
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}

function EnableDialog({
  row,
  busy,
  onConfirm,
  onClose,
}: {
  row: UsersRow;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="Enable this account?"
      subtitle={row.email || row.name || row.id}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Enabling…' : 'Enable account'}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-xs leading-relaxed text-primary/80">
        <p>New sign-ins are accepted again, with the role the account already holds.</p>
        <p>
          Sessions revoked earlier stay revoked — the person signs in fresh rather than resuming an
          old browser session.
        </p>
      </div>
    </ConfirmDialog>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Badge({
  label,
  tone,
  title,
}: {
  label: string;
  tone: 'success' | 'info' | 'neutral' | 'warning' | 'danger';
  title: string;
}) {
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

function UsersSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="sr-only">Loading accounts…</p>
      <div className="h-16 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-24 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-neutral-surface" />
      <div className="h-32 animate-pulse rounded-xl bg-neutral-surface" />
    </div>
  );
}
