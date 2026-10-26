import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

/**
 * Better Auth roles, matching the app's existing `client` / `therapist` /
 * `admin` roles. Only admins hold user-management permissions. Impersonation
 * is deliberately left out: an admin acting as a client would see that
 * client's therapy bookings.
 */
export const ac = createAccessControl({ ...defaultStatements });

export const roles = {
  admin: ac.newRole({
    user: ['create', 'list', 'set-role', 'ban', 'delete', 'set-password', 'set-email', 'get', 'update'],
    session: ['list', 'revoke', 'delete'],
  }),
  therapist: ac.newRole({ user: [], session: [] }),
  client: ac.newRole({ user: [], session: [] }),
};

export type AppRole = keyof typeof roles;
