import { describe, it, expect, vi, beforeEach } from 'vitest';

const { client } = vi.hoisted(() => ({
  client: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
  },
}));
vi.mock('@/lib/auth/authClient', () => ({ authClient: client }));

import { betterAuthService, toAuthError } from './betterAuthService';

const ok = { data: {}, error: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toAuthError', () => {
  it.each([
    ['INVALID_EMAIL_OR_PASSWORD', 'auth/invalid-credential'],
    ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'auth/email-already-in-use'],
    ['PASSWORD_TOO_SHORT', 'auth/weak-password'],
    ['INVALID_EMAIL', 'auth/invalid-email'],
    ['BANNED_USER', 'auth/user-disabled'],
  ])('maps %s to %s for the login page', (code, firebaseCode) => {
    expect(toAuthError({ code, message: 'x' }).code).toBe(firebaseCode);
  });

  it('treats a 429 as too many requests', () => {
    expect(toAuthError({ status: 429, message: 'Too many requests' }).code).toBe('auth/too-many-requests');
  });

  it('keeps the message and no code for anything unknown', () => {
    const err = toAuthError({ code: 'SOMETHING_NEW', message: 'Server said no' });
    expect(err.message).toBe('Server said no');
    expect(err.code).toBeUndefined();
  });
});

describe('betterAuthService', () => {
  it('signs in with email and password', async () => {
    client.signIn.email.mockResolvedValue(ok);
    await betterAuthService.login('a@x.com', 'pw123456');
    expect(client.signIn.email).toHaveBeenCalledWith({ email: 'a@x.com', password: 'pw123456' });
  });

  it('throws the mapped error when sign-in is refused', async () => {
    client.signIn.email.mockResolvedValue({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password', status: 401 } });
    await expect(betterAuthService.login('a@x.com', 'bad')).rejects.toMatchObject({ code: 'auth/invalid-credential' });
  });

  it('reports a network failure with the Firebase network code', async () => {
    client.signIn.email.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(betterAuthService.login('a@x.com', 'pw')).rejects.toMatchObject({ code: 'auth/network-request-failed' });
  });

  it('signs up with the name', async () => {
    client.signUp.email.mockResolvedValue(ok);
    await betterAuthService.register('a@x.com', 'pw123456', 'Asha');
    expect(client.signUp.email).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@x.com', password: 'pw123456', name: 'Asha' }));
  });

  it('sends Google sign-in back to the page that started it', async () => {
    client.signIn.social.mockResolvedValue(ok);
    await betterAuthService.loginWithGoogle('/login?next=%2Fbook');
    expect(client.signIn.social).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', callbackURL: '/login?next=%2Fbook' }));
  });

  it('asks for a reset link that lands on /reset-password', async () => {
    client.requestPasswordReset.mockResolvedValue(ok);
    await betterAuthService.requestPasswordReset('a@x.com');
    expect(client.requestPasswordReset).toHaveBeenCalledWith({ email: 'a@x.com', redirectTo: '/reset-password' });
  });

  it('resets the password with the token from the link', async () => {
    client.resetPassword.mockResolvedValue(ok);
    await betterAuthService.resetPassword('tok', 'newpass123');
    expect(client.resetPassword).toHaveBeenCalledWith({ token: 'tok', newPassword: 'newpass123' });
  });

  it('surfaces an expired reset link', async () => {
    client.resetPassword.mockResolvedValue({ data: null, error: { code: 'INVALID_TOKEN', message: 'Invalid token', status: 400 } });
    await expect(betterAuthService.resetPassword('old', 'newpass123')).rejects.toThrow('Invalid token');
  });
});
