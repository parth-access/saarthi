import { describe, it, expect } from 'vitest';
import {
  generateSessionReminderStudentEmail,
  generateSessionReminderTherapistEmail,
  generatePaymentReceiptEmail,
  generateContactConfirmationEmail,
  generateContactConfirmationText,
} from './emailTemplates';

const reminderData = {
  patientName: 'Test User',
  therapistName: 'Dravina Gupta',
  sessionType: 'Individual Therapy Session',
  sessionMode: 'online',
  date: '2026-09-04',
  time: '09:45 AM',
  duration: '45 minutes',
  meetingUrl: 'https://meet.google.com/abc-defg-hij'
};

describe('email templates', () => {
  it('says the reminder is 30 minutes before the session', () => {
    const student = generateSessionReminderStudentEmail(reminderData);
    expect(student).toContain('Session in 30 Minutes');
    expect(student).not.toContain('5 Hours');
    expect(student).not.toContain('5 hours');

    const therapist = generateSessionReminderTherapistEmail(reminderData);
    expect(therapist).toContain('Upcoming Session in 30 Minutes');
    expect(therapist).not.toContain('5 Hours');
    expect(therapist).not.toContain('5 hours');
  });

  it('uses the Saarthi logo and brand fonts in the shared layout', () => {
    const html = generatePaymentReceiptEmail({
      patientName: 'Test User',
      therapistName: 'Dravina Gupta',
      amount: 1500,
      currency: 'INR',
      orderId: 'order_123',
      paymentId: 'pay_123',
      sessionDate: '2026-09-04',
      sessionTime: '09:45 AM',
      paidAt: '1 Sep 2026, 10:00 AM IST'
    });

    // Logo header image, hosted on the production domain (no localhost).
    expect(html).toContain('https://www.saarthilife.com/saarthi-logo-Photoroom.png');
    expect(html).toContain('alt="Saarthi"');
    // Playfair Display (site serif) + Inter, with fallbacks.
    expect(html).toContain('Playfair');
    expect(html).toContain('Georgia');
    // The crisis note footer must never be dropped.
    expect(html).toContain('Saarthi is not an emergency psychiatric service');
  });
});

describe('contact form confirmation email', () => {
  const base = {
    name: 'Asha Rao',
    email: 'asha@example.com',
    message: 'I would like to know more about evening sessions.',
  };

  it('uses the shared Saarthi layout and greeting', () => {
    const html = generateContactConfirmationEmail(base);

    // Same shell as every other transactional email.
    expect(html).toContain('https://www.saarthilife.com/saarthi-logo-Photoroom.png');
    expect(html).toContain('Playfair');
    expect(html).toContain('Saarthi is not an emergency psychiatric service');

    // The acknowledgement itself.
    expect(html).toContain('Hi Asha Rao,');
    expect(html).toContain('Thank you for reaching out to Saarthi');
    expect(html).toContain("We've received your message and our team will review it.");
    expect(html).toContain("We'll get back to you at:");
    expect(html).toContain('asha@example.com');
    expect(html).toContain("We'll be in touch soon.");
    expect(html).toContain('The Saarthi Team');
  });

  it('has a plain-text twin that carries the same message and crisis note', () => {
    const text = generateContactConfirmationText(base);

    expect(text).toContain('Hi Asha Rao,');
    expect(text).toContain(base.message);
    expect(text).toContain('asha@example.com');
    expect(text).toContain('Saarthi is not an emergency psychiatric service');
    expect(text).not.toContain('<p');
  });

  it('escapes visitor-supplied name and message so no form HTML becomes email markup', () => {
    const html = generateContactConfirmationEmail({
      name: '<img src=x onerror=alert(1)>Priya',
      email: 'priya@example.com',
      message: '<script>alert("xss")</script> & "quoted" <b>bold</b>',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('&amp;');
  });

  it('renders special characters and very long messages on one wrapped block', () => {
    const longMessage = `${'word '.repeat(400)}₹1,500 — “curly” & <angle>`;
    const html = generateContactConfirmationEmail({ ...base, message: longMessage });

    // The message is one pre-wrapped block, so a long body cannot break the card.
    expect(html).toContain('white-space: pre-wrap');
    expect(html).toContain('word-break: break-word');
    // Non-ASCII punctuation is left intact (only & < > " ' are entity-encoded),
    // and an <angle> bracket is escaped rather than parsed as markup.
    expect(html).toContain('₹1,500');
    expect(html).toContain('“curly” &amp; &lt;angle&gt;');
    expect(html.length).toBeGreaterThan(longMessage.length);
  });
});