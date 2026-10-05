import { describe, it, expect } from 'vitest';
import {
  generateBookingSlotReleasedEmail,
  generatePaymentFailedEmail,
  generateBookingConfirmedEmail,
} from './emailTemplates';

/**
 * HTML-injection contract for transactional email templates (post-P2-5):
 * every client-influenced value must render as TEXT in the recipient's mail
 * client, never as markup. Fields of the `*EmailData` objects are pre-escaped
 * by emailSender (the documented contract); free-text params (`reason`) are
 * escaped HERE at the template boundary.
 */

const XSS_SCRIPT = '<script>alert(1)</script>';
const XSS_IMG = '<img src=x onerror=alert(1)>';

const baseData = {
  patientName: 'Ananya &lt;Sharma&gt;', // already escaped upstream — must stay single-escaped
  therapistName: 'Dr Priya',
  date: '2026-10-10',
  time: '10:00',
  phone: '9999999999',
  bookingToken: 'a'.repeat(72),
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
};

describe('email template HTML escaping', () => {
  it('renders a malicious slot-released reason as text, not markup', () => {
    const html = generateBookingSlotReleasedEmail(baseData, XSS_SCRIPT);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes an image-onerror payload in the slot-released reason', () => {
    const html = generateBookingSlotReleasedEmail(baseData, XSS_IMG);

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes reason and failureReason in the payment-failed template', () => {
    const html = generatePaymentFailedEmail(
      { ...baseData, sessionDate: '2026-10-10', sessionTime: '10:00', orderId: 'order_1', paymentId: 'pay_1', amount: 1500, currency: 'INR', failureReason: XSS_SCRIPT },
      XSS_IMG
    );

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes HTML entities, quotes and ampersands so they display literally', () => {
    const tricky = `He said "5-7 days" & <pending> — it's fine`;
    const html = generateBookingSlotReleasedEmail(baseData, tricky);

    expect(html).toContain('&quot;5-7 days&quot; &amp; &lt;pending&gt;');
  });

  it('does NOT double-escape values that emailSender already escaped', () => {
    const html = generateBookingConfirmedEmail(baseData);

    // single-escaped entity passes through once — not &amp;lt;
    expect(html).toContain('Ananya &lt;Sharma&gt;');
    expect(html).not.toContain('&amp;lt;');
  });
});
