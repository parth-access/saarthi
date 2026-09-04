import { describe, it, expect } from 'vitest';
import {
  generateSessionReminderStudentEmail,
  generateSessionReminderTherapistEmail,
  generatePaymentReceiptEmail
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