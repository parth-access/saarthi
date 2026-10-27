"use client";

import { authClient } from '@/lib/auth/authClient';

/**
 * Sign-in calls for NEXT_PUBLIC_AUTH_PROVIDER=better-auth. authService
 * delegates here, so pages keep calling the same functions in both modes.
 *
 * Failures are thrown as errors carrying the matching Firebase `auth/*` code,
 * because the login page already turns those codes into friendly sentences.
 */

interface BetterAuthError {
  code?: string;
  message?: string;
  status?: number;
}

const FIREBASE_CODES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'auth/invalid-credential',
  INVALID_PASSWORD: 'auth/invalid-credential',
  USER_NOT_FOUND: 'auth/invalid-credential',
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'auth/invalid-credential',
  USER_ALREADY_EXISTS: 'auth/email-already-in-use',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth/email-already-in-use',
  PASSWORD_TOO_SHORT: 'auth/weak-password',
  INVALID_EMAIL: 'auth/invalid-email',
  BANNED_USER: 'auth/user-disabled',
};

export function toAuthError(error: BetterAuthError): Error & { code?: string } {
  const code = error.status === 429 ? 'auth/too-many-requests' : error.code ? FIREBASE_CODES[error.code] : undefined;
  return Object.assign(new Error(error.message || 'Something went wrong. Please try again.'), code ? { code } : {});
}

async function call<T extends { error: BetterAuthError | null }>(request: Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await request;
  } catch {
    throw Object.assign(new Error('Network error'), { code: 'auth/network-request-failed' });
  }
  if (result.error) throw toAuthError(result.error);
  return result;
}

export const betterAuthService = {
  login: async (email: string, password: string) => {
    await call(authClient.signIn.email({ email, password }));
  },

  register: async (email: string, password: string, name: string) => {
    // The verification email is sent by the server on sign-up.
    await call(authClient.signUp.email({ email, password, name, callbackURL: '/dashboard' }));
  },

  /**
   * Full-page redirect to Google; Better Auth handles the callback and
   * returns to `returnTo` (the login page, which then routes by role).
   */
  loginWithGoogle: async (returnTo: string) => {
    await call(authClient.signIn.social({ provider: 'google', callbackURL: returnTo, errorCallbackURL: '/login?error=google' }));
  },

  logout: async () => {
    await authClient.signOut();
  },

  /** Always resolves the same way, so the form can't reveal whether an account exists. */
  requestPasswordReset: async (email: string) => {
    await call(authClient.requestPasswordReset({ email, redirectTo: '/reset-password' }));
  },

  resetPassword: async (token: string, newPassword: string) => {
    await call(authClient.resetPassword({ token, newPassword }));
  },

  sendVerificationEmail: async (email: string) => {
    await call(authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' }));
  },
};
