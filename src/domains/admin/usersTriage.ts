/**
 * The users & roles domain, shared by the API routes, the response interpreter
 * and the screen.
 *
 * Role mutation is the one console capability whose failure mode is granting
 * authority, so the invariants live here as pure decisions rather than as
 * scattered conditionals in a route:
 *
 *  - the role vocabulary is closed — the platform only ever reads
 *    'admin' | 'therapist' | 'client' (verifySession defaults missing roles to
 *    'client'), so the console cannot invent a fourth role;
 *  - an administrator cannot mutate their own account through this console;
 *  - the platform must never lose its last administrator — demoting or
 *    disabling an admin requires at least one other account holding the role.
 *
 * Access revocation has two levers, and both are real writes:
 *  - `sessionRevokeBefore` (epoch seconds) — verifySession rejects any session
 *    issued before the mark, so existing cookies die on the person's next
 *    request;
 *  - `accountDisabled` — POST /api/auth/session refuses to mint a new session
 *    cookie for a disabled account, so revocation survives past the next
 *    sign-in.
 * One without the other is theater: revoking sessions alone lets the person
 * sign straight back in; blocking sign-in alone leaves the stolen cookie
 * working for up to five days.
 */
export const USER_ROLES = ['admin', 'therapist', 'client'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * The one composite index the role-filtered users pages need (equality on
 * `role` with `createdAt DESC` ordering). Unfiltered pages ride the automatic
 * single-field `createdAt` index; exact-email lookups are an un-ordered
 * equality query, also automatic. Declared here so the plan↔index agreement
 * test can pin it against firestore.indexes.json without importing Firestore.
 */
export const USERS_INDEX_REQUIREMENTS = [
  {
    collectionGroup: 'users',
    fields: [
      { fieldPath: 'role', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
] as const;

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Administrator',
  therapist: 'Therapist',
  client: 'Client',
};

export function userRoleLabel(role: string): string {
  return isUserRole(role) ? USER_ROLE_LABELS[role] : `Unknown (${role})`;
}

/** Unknown stored roles get the warning tone — the console never hides a role it does not know. */
export function userRoleBadge(role: string): { label: string; tone: 'success' | 'info' | 'neutral' | 'warning' } {
  switch (role) {
    case 'admin':
      return { label: USER_ROLE_LABELS.admin, tone: 'info' };
    case 'therapist':
      return { label: USER_ROLE_LABELS.therapist, tone: 'success' };
    case 'client':
      return { label: USER_ROLE_LABELS.client, tone: 'neutral' };
    default:
      return { label: userRoleLabel(role), tone: 'warning' };
  }
}

export interface UsersRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly provider: string | null;
  readonly createdAtIso: string | null;
  readonly accountDisabled: boolean;
  readonly sessionRevokeBeforeSeconds: number | null;
}

export type UsersPageScan =
  | { ok: true; page: { rows: UsersRow[]; nextCursor: { createdAtMs: number; id: string } | null } }
  | { ok: false; reason: string };

export type AdministratorCountScan =
  | { ok: true; count: number }
  | { ok: false; reason: string };

/** One mutation decision the PATCH route can act on without further judgement. */
export type MutationDecision =
  | { kind: 'proceed' }
  | { kind: 'noop'; summary: string }
  | { kind: 'refuse'; status: number; error: string };

const LAST_ADMIN_REFUSAL =
  'This is the last administrator account. Grant the administrator role to another account first, then change this one.';

/**
 * Changing one account's role. Self-changes are refused outright; demoting the
 * only administrator is refused while any other account still holds the role.
 */
export function roleChangeDecision(input: {
  targetUid: string;
  actorUid: string;
  currentRole: string;
  nextRole: UserRole;
  otherAdministratorCount: number;
}): MutationDecision {
  if (input.targetUid === input.actorUid) {
    return {
      kind: 'refuse',
      status: 400,
      error: 'This is your own account. Ask another administrator to change your role.',
    };
  }
  if (input.currentRole === input.nextRole) {
    return {
      kind: 'noop',
      summary: `This account already holds the ${USER_ROLE_LABELS[input.nextRole]} role; nothing was written.`,
    };
  }
  if (input.currentRole === 'admin' && input.nextRole !== 'admin' && input.otherAdministratorCount < 1) {
    return { kind: 'refuse', status: 409, error: LAST_ADMIN_REFUSAL };
  }
  return { kind: 'proceed' };
}

/** Disabling an account removes access; enabling restores sign-in. */
export function disableDecision(input: {
  targetUid: string;
  actorUid: string;
  currentRole: string;
  otherAdministratorCount: number;
}): MutationDecision {
  if (input.targetUid === input.actorUid) {
    return {
      kind: 'refuse',
      status: 400,
      error: 'This is your own account. It cannot be disabled from the console.',
    };
  }
  if (input.currentRole === 'admin' && input.otherAdministratorCount < 1) {
    return { kind: 'refuse', status: 409, error: LAST_ADMIN_REFUSAL };
  }
  return { kind: 'proceed' };
}

export const SELF_REVOKE_REFUSAL =
  'This is your own account. To sign this browser out, use sign-out — revoking your own sessions from the console would lock you out mid-incident.';

/**
 * The audit row's one-line `details` for each action, in the same shape the
 * bookability endpoint writes. Kept here so the route and its tests quote the
 * same sentences.
 */
export function auditDetailsFor(
  action: 'role' | 'revoke' | 'disable' | 'enable',
  input: { targetUid: string; actorUid: string; before?: string; after?: string }
): string {
  switch (action) {
    case 'role':
      return `Admin ${input.actorUid} changed role of user ${input.targetUid} from ${input.before} to ${input.after}`;
    case 'revoke':
      return `Admin ${input.actorUid} revoked all sessions of user ${input.targetUid}`;
    case 'disable':
      return `Admin ${input.actorUid} disabled account ${input.targetUid}`;
    case 'enable':
      return `Admin ${input.actorUid} re-enabled account ${input.targetUid}`;
  }
}
