import { describe, it, expect } from 'vitest';
import { generatePaymentRefundedEmail } from './emailTemplates';

const base = {
  patientName: 'Asha',
  therapistName: 'Dr. Mehta',
  amount: 1500,
  currency: 'INR',
  paymentId: 'pay_TEST123',
  sessionDate: 'Tuesday, 27 October 2026',
  sessionTime: '01:00 PM',
};

describe('generatePaymentRefundedEmail', () => {
  it('tells the customer a full refund of their amount is on its way', () => {
    const html = generatePaymentRefundedEmail(base);
    expect(html).toContain('₹1,500');
    expect(html).toContain('Full refund initiated');
    expect(html).toContain('pay_TEST123');
    expect(html).toContain('Tuesday, 27 October 2026 at 01:00 PM');
    // Saarthi did receive this money: it must not reuse the "not captured" wording.
    expect(html).not.toContain('did not capture payment');
  });

  it('escapes the payment id', () => {
    const html = generatePaymentRefundedEmail({ ...base, paymentId: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
  });

  it('still renders without an amount', () => {
    expect(generatePaymentRefundedEmail({ ...base, amount: undefined })).toContain('Your payment');
  });
});
