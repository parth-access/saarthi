import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sendMock, addMock } = vi.hoisted(() => {
  // The route decides at import time whether Resend is available.
  process.env.RESEND_API_KEY = 'test-key';
  return { sendMock: vi.fn(), addMock: vi.fn() };
});

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => ({ add: addMock }) },
}));

vi.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } },
}));

vi.mock('../_lib/rateLimit', () => ({
  checkRateLimit: () => ({ success: true }),
}));

import { POST } from './route';

function submit(body: Record<string, unknown>): Promise<Response> {
  return POST(
    new Request('https://saarthilife.com/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify(body),
    })
  );
}

/**
 * The visitor's auto-reply must look like every other Saarthi email, and the
 * message they typed must never be able to become markup in it.
 */
describe('POST /api/contact', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({ data: { id: 'email_1' }, error: null });
    addMock.mockReset().mockResolvedValue({ id: 'contact_1' });
  });

  it('sends an internal notification and a branded auto-reply', async () => {
    const res = await submit({
      name: 'Asha Rao',
      email: 'asha@example.com',
      message: 'Evening sessions please.',
    });

    expect(res.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(2);

    const [notification, autoReply] = sendMock.mock.calls;
    expect(notification[0].to).toBe('contact@saarthilife.com');
    expect(notification[0].subject).toBe('New Saarthi Contact Inquiry');

    expect(autoReply[0].to).toBe('asha@example.com');
    expect(autoReply[0].subject).toBe('We received your message — Saarthi');

    // The shared Saarthi layout, not a two-line plain email.
    const html = autoReply[0].html as string;
    expect(html).toContain('saarthi-logo-Photoroom.png');
    expect(html).toContain('Hi Asha Rao,');
    expect(html).toContain('Evening sessions please.');
    expect(html).toContain('Saarthi is not an emergency psychiatric service');

    // Plain-text twin for clients that block HTML.
    const text = autoReply[0].text as string;
    expect(text).toContain('Hi Asha Rao,');
    expect(text).toContain('Evening sessions please.');
    expect(text).toContain('The Saarthi Team');
  });

  it('escapes visitor-supplied content in the auto-reply', async () => {
    await submit({
      name: 'Asha',
      email: 'asha@example.com',
      message: '<script>alert(1)</script>',
    });

    const html = sendMock.mock.calls[1][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('never stores or emails a filled honeypot submission', async () => {
    const res = await submit({
      name: 'Bot',
      email: 'bot@example.com',
      message: 'spam',
      honeypot: 'filled',
    });

    // The schema only accepts an empty honeypot, so a filled one is rejected at
    // the boundary — nothing is written and no email leaves the server.
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload', async () => {
    const res = await submit({ name: '', email: 'not-an-email', message: '' });

    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
