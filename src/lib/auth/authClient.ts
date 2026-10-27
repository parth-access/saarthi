"use client";

import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

/**
 * Browser client for Better Auth (/api/auth/*, same origin, so no baseURL).
 * Only used when NEXT_PUBLIC_AUTH_PROVIDER=better-auth. The admin plugin adds
 * `role` and `banned` to the session's user.
 */
export const authClient = createAuthClient({
  plugins: [adminClient()],
});
