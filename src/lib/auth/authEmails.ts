import { after } from 'next/server';
import { getResendClient } from '@/app/api/_lib/resendClient';
import { logger } from '@/app/api/_lib/logger';
import { generatePasswordResetEmail, generateVerifyEmailEmail } from '@/app/api/_lib/emailTemplates';

/**
 * Better Auth's password-reset and email-verification hooks, sent through
 * Resend with the site's email templates.
 *
 * The hooks return before the email is sent: awaiting the send would make a
 * reset request for a real account measurably slower than one for an unknown
 * email, which leaks which emails have accounts. The send runs after the
 * response via `after()`. A failed send is logged, never thrown.
 */

const FROM = 'Saarthi Accounts <contact@saarthilife.com>';

type AuthEmailKind = 'reset-password' | 'verify-email';

interface AuthEmailUser {
  id: string;
  email: string;
  name?: string | null;
}

const MESSAGES: Record<AuthEmailKind, { subject: string; html: (name: string, url: string) => string; text: (name: string, url: string) => string }> = {
  'reset-password': {
    subject: 'Reset your Saarthi password',
    html: (name, url) => generatePasswordResetEmail({ name, url }),
    text: (name, url) =>
      `Hi ${name},\nWe received a request to reset the password for your Saarthi account. Choose a new password here:\n${url}\nThis link expires in 1 hour and can be used once. If you didn't ask for this, you can ignore this email.\n- The Saarthi Team`,
  },
  'verify-email': {
    subject: 'Confirm your email for Saarthi',
    html: (name, url) => generateVerifyEmailEmail({ name, url }),
    text: (name, url) =>
      `Hi ${name},\nPlease confirm this is your email address:\n${url}\nThis link expires in 1 hour. If you didn't create a Saarthi account, you can ignore this email.\n- The Saarthi Team`,
  },
};

export async function sendAuthEmail(kind: AuthEmailKind, user: AuthEmailUser, url: string): Promise<void> {
  const name = user.name?.trim() || 'there';
  const message = MESSAGES[kind];
  try {
    const { error } = await getResendClient().emails.send({
      from: FROM,
      to: user.email,
      subject: message.subject,
      html: message.html(name, url),
      text: message.text(name, url),
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    // userId only: the email and the link (which carries the token) stay out of logs.
    logger.error('EMAIL', `Auth email failed: ${kind}`, { userId: user.id, error: err instanceof Error ? err.message : String(err) });
  }
}

function inBackground(task: Promise<void>): void {
  try {
    after(task);
  } catch {
    // Outside a request (scripts, tests): the promise still runs; sendAuthEmail never rejects.
    void task;
  }
}

export async function sendResetPasswordEmail({ user, url }: { user: AuthEmailUser; url: string }): Promise<void> {
  inBackground(sendAuthEmail('reset-password', user, url));
}

export async function sendVerificationEmail({ user, url }: { user: AuthEmailUser; url: string }): Promise<void> {
  inBackground(sendAuthEmail('verify-email', user, url));
}
