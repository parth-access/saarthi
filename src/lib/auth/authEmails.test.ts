import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
const afterMock = vi.fn();
const errorLog = vi.fn();

vi.mock('@/app/api/_lib/resendClient', () => ({ getResendClient: () => ({ emails: { send: sendMock } }) }));
vi.mock('@/app/api/_lib/logger', () => ({ logger: { error: errorLog, warn: vi.fn(), info: vi.fn() } }));
vi.mock('next/server', () => ({ after: afterMock }));

const { sendAuthEmail, sendResetPasswordEmail, sendVerificationEmail } = await import('./authEmails');

const USER = { id: 'u1', email: 'asha@example.com', name: 'Asha <b>R</b>' };
const URL_WITH_TOKEN = 'https://www.saarthilife.com/api/auth/reset-password/tok_123?callbackURL=%2Freset&x=1';

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue({ data: { id: 're_1' }, error: null });
});

describe('sendAuthEmail', () => {
  it('sends the reset email to the user with the link in both html and text', async () => {
    await sendAuthEmail('reset-password', USER, URL_WITH_TOKEN);
    const msg = sendMock.mock.calls[0][0];
    expect(msg).toMatchObject({ to: 'asha@example.com', subject: 'Reset your Saarthi password', from: 'Saarthi Accounts <contact@saarthilife.com>' });
    expect(msg.html).toContain('href="https://www.saarthilife.com/api/auth/reset-password/tok_123?callbackURL=%2Freset&amp;x=1"');
    expect(msg.text).toContain(URL_WITH_TOKEN);
  });

  it('escapes the user name in the html', async () => {
    await sendAuthEmail('verify-email', USER, 'https://www.saarthilife.com/api/auth/verify-email?token=t');
    const msg = sendMock.mock.calls[0][0];
    expect(msg.subject).toBe('Confirm your email for Saarthi');
    expect(msg.html).toContain('Asha &lt;b&gt;R&lt;/b&gt;');
    expect(msg.html).not.toContain('<b>R</b>');
  });

  it('falls back to a greeting when the name is blank', async () => {
    await sendAuthEmail('verify-email', { ...USER, name: '  ' }, 'https://x.test/v');
    expect(sendMock.mock.calls[0][0].text).toMatch(/^Hi there,/);
  });

  it('logs a Resend error without the email or link, and does not throw', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    await expect(sendAuthEmail('reset-password', USER, URL_WITH_TOKEN)).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith('EMAIL', 'Auth email failed: reset-password', { userId: 'u1', error: 'domain not verified' });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('tok_123');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('asha@example.com');
  });

  it('does not throw when the client itself throws', async () => {
    sendMock.mockRejectedValue(new Error('RESEND_API_KEY is not configured'));
    await expect(sendAuthEmail('verify-email', USER, 'https://x.test/v')).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledOnce();
  });
});

describe('Better Auth hooks', () => {
  it('hand the send to after() instead of awaiting it', async () => {
    let release!: () => void;
    sendMock.mockReturnValue(new Promise((r) => (release = () => r({ data: {}, error: null }))));
    // Resolves even though the send is still pending.
    await sendResetPasswordEmail({ user: USER, url: URL_WITH_TOKEN });
    expect(afterMock).toHaveBeenCalledOnce();
    expect(afterMock.mock.calls[0][0]).toBeInstanceOf(Promise);
    release();
  });

  it('still send when after() is unavailable outside a request', async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error('`after` was called outside a request scope');
    });
    await sendVerificationEmail({ user: USER, url: 'https://x.test/v' });
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalledOnce());
  });
});
