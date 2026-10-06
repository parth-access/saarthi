import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/auth/requireRole';
import { checkRateLimit, getClientIp } from '@/app/api/_lib/rateLimit';
import { logger } from '../../../_lib/logger';
import {
  countOtherAdministrators,
  readUser,
  revokeUserSessions,
  setUserAccountDisabled,
  setUserRole,
} from '../usersSources';
import {
  auditDetailsFor,
  disableDecision,
  roleChangeDecision,
  SELF_REVOKE_REFUSAL,
  USER_ROLE_LABELS,
  type MutationDecision,
} from '@/domains/admin/usersTriage';

export const dynamic = 'force-dynamic';

/**
 * The one write path for account authority: change a role, revoke sessions,
 * disable or re-enable an account.
 *
 * The guards, in order: `requireAdmin` (live role re-read, so a demoted
 * administrator is refused on this very request), a rate limit, a readable-id
 * check, then the domain decisions in usersTriage — no self-mutation, no
 * removing the platform's last administrator, and no re-writing a state the
 * account already holds. Every accepted change writes a durable `audit_logs`
 * row with before/after, exactly like the bookability switch, because the
 * generic auditService singleton has no repository behind it.
 *
 * What each action actually does, enforced by the platform rather than this
 * route: a role change lands on the person's next request (verifySession
 * re-reads the role live); a revoke mark makes verifySession reject every
 * session issued before it; a disabled account is refused a new session by
 * POST /api/auth/session — existing ones die via the revoke mark set in the
 * same write.
 */
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setRole'), role: z.enum(['client', 'therapist', 'admin']) }),
  z.object({ action: z.literal('revokeSessions') }),
  z.object({ action: z.literal('disableAccount') }),
  z.object({ action: z.literal('enableAccount') }),
]);

const READABLE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function roleSummary(nextRole: 'client' | 'therapist' | 'admin'): string {
  const now = `This account holds the ${USER_ROLE_LABELS[nextRole]} role now.`;
  const effect =
    'It takes effect on the person’s next request — pages they already have open keep rendering, but every action re-checks.';
  return `${now} ${effect}`;
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const authResult = await requireAdmin(req as unknown as Request);
  if (authResult instanceof NextResponse) return authResult;
  const session = authResult;

  const limit = checkRateLimit(getClientIp(req), 'admin_user_mutation', 15, 60_000);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many changes in a short time. Wait a minute and try again.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const { userId } = await context.params;
  if (!READABLE_ID.test(userId) || userId.startsWith('__')) {
    return NextResponse.json({ error: 'That is not a valid user id.' }, { status: 400 });
  }

  let action: z.infer<typeof actionSchema>;
  try {
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A JSON body with a supported action is required.' },
        { status: 400 }
      );
    }
    action = parsed.data;
  } catch {
    return NextResponse.json({ error: 'A JSON body with a supported action is required.' }, { status: 400 });
  }

  const snapshot = await readUser(userId);
  if (!snapshot) {
    return NextResponse.json({ error: 'No user exists with that id.' }, { status: 404 });
  }
  const before = snapshot.row;

  // The last-admin guard only matters when the change could remove an
  // administrator; anything else skips the query entirely.
  const guardNeeded =
    action.action === 'disableAccount'
      ? before.role === 'admin'
      : action.action === 'setRole' && before.role === 'admin' && action.role !== before.role;
  const otherAdministratorCount = guardNeeded ? await countOtherAdministrators(userId) : 0;

  let decision: MutationDecision;
  switch (action.action) {
    case 'setRole':
      decision = roleChangeDecision({
        targetUid: userId,
        actorUid: session.uid,
        currentRole: before.role,
        nextRole: action.role,
        otherAdministratorCount,
      });
      break;
    case 'revokeSessions':
      decision =
        userId === session.uid
          ? { kind: 'refuse', status: 400, error: SELF_REVOKE_REFUSAL }
          : { kind: 'proceed' };
      break;
    case 'disableAccount':
      decision =
        before.accountDisabled
          ? { kind: 'noop', summary: 'This account is already disabled; nothing was written.' }
          : disableDecision({ targetUid: userId, actorUid: session.uid, currentRole: before.role, otherAdministratorCount });
      break;
    case 'enableAccount':
      decision = before.accountDisabled
        ? { kind: 'proceed' }
        : { kind: 'noop', summary: 'This account is not disabled; nothing was written.' };
      break;
  }

  if (decision.kind === 'refuse') {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  if (decision.kind === 'noop') {
    return NextResponse.json({ success: true, changed: false, summary: decision.summary });
  }

  const revokedAtSeconds = Math.floor(Date.now() / 1000);
  const result =
    action.action === 'setRole'
      ? await setUserRole(userId, action.role)
      : action.action === 'revokeSessions'
        ? await revokeUserSessions(userId, revokedAtSeconds)
        : await setUserAccountDisabled(userId, action.action === 'disableAccount', revokedAtSeconds);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const eventType =
    action.action === 'setRole'
      ? 'USER_ROLE_CHANGED'
      : action.action === 'revokeSessions'
        ? 'USER_SESSIONS_REVOKED'
        : action.action === 'disableAccount'
          ? 'USER_ACCOUNT_DISABLED'
          : 'USER_ACCOUNT_ENABLED';

  // The durable audit row — before/after and who changed it. Without this the
  // change is invisible to the Activity log, and authority changed silently.
  await adminDb.collection('audit_logs').add({
    eventType,
    userId: session.uid,
    targetUserId: userId,
    before: {
      role: before.role,
      accountDisabled: before.accountDisabled,
      sessionRevokeBeforeSeconds: before.sessionRevokeBeforeSeconds,
    },
    after: {
      role: action.action === 'setRole' ? action.role : before.role,
      accountDisabled: action.action === 'disableAccount' ? true : action.action === 'enableAccount' ? false : before.accountDisabled,
      sessionRevokeBeforeSeconds:
        action.action === 'revokeSessions' || action.action === 'disableAccount'
          ? revokedAtSeconds
          : before.sessionRevokeBeforeSeconds,
    },
    details:
      action.action === 'setRole'
        ? auditDetailsFor('role', {
            targetUid: userId,
            actorUid: session.uid,
            before: before.role,
            after: action.role,
          })
        : auditDetailsFor(
            action.action === 'revokeSessions' ? 'revoke' : action.action === 'disableAccount' ? 'disable' : 'enable',
            { targetUid: userId, actorUid: session.uid }
          ),
    timestamp: FieldValue.serverTimestamp(),
  });

  logger.info('OPERATIONS', `Admin ${session.uid} performed ${eventType} on user ${userId}`);

  const summary =
    action.action === 'setRole'
      ? roleSummary(action.role)
      : action.action === 'revokeSessions'
        ? 'Every session issued before now is rejected on this person’s next request. They can sign in again immediately.'
        : action.action === 'disableAccount'
          ? 'Existing sessions are rejected from now on, and new sign-ins are refused at session creation. Re-enable the account to restore sign-in.'
          : 'New sign-ins are accepted again. Sessions revoked earlier stay revoked.';

  return NextResponse.json({ success: true, changed: true, action: action.action, summary });
}
