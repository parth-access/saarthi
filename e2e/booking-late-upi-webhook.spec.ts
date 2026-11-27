import { test, expect } from '@playwright/test';
import { auditEvents, bookingsFor, clearFirestore, emulatorDb, seedTherapist, slotId } from './support/firestore';
import { fakeRazorpay, sendWebhook, installFakeCheckout } from './support/razorpay';
import { fillDetails, newClient, payWithUpi, pickSlot } from './support/booking';

test.beforeEach(async ({ page }) => {
  await clearFirestore();
  await fakeRazorpay.reset();
  await seedTherapist();
  await installFakeCheckout(page);
});

test('a UPI payment approved after checkout closed is confirmed by the webhook alone', async ({ page }) => {
  const client = newClient('late-upi');
  await pickSlot(page, '11:30');
  await fillDetails(page, client);

  // The customer starts a UPI collect request, then gives up on the page
  // before approving it in their UPI app.
  const checkout = await payWithUpi(page, { approveLater: true });
  await expect(checkout.getByRole('status')).toHaveText('Waiting for approval in your UPI app');
  const paymentId = await checkout.getAttribute('data-payment-id');
  expect(paymentId).toBeTruthy();
  await checkout.getByRole('button', { name: 'Close checkout' }).click();
  await expect(page.getByText('Payment was not completed')).toBeVisible();

  // Closing checkout reported the attempt as failed and released the booking.
  await expect.poll(async () => (await bookingsFor(client.email))[0]?.status).toBe('cancelled');

  // Minutes later the customer approves; Razorpay captures and sends the
  // webhook. The browser is long gone, so the webhook is the only signal.
  const { payment } = await fakeRazorpay.capture(paymentId!);
  const res = await sendWebhook('payment.captured', payment);
  expect(res.status).toBe(200);

  const [booking] = await bookingsFor(client.email);
  expect(booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', razorpayPaymentId: paymentId });
  const slot = await emulatorDb().collection('locked_slots').doc(slotId('11:30')).get();
  expect(slot.data()).toMatchObject({ bookingId: booking.id, status: 'booked' });

  const payments = await emulatorDb().collection('payments').where('bookingId', '==', booking.id).get();
  expect(payments.docs.map((d) => d.data().status)).toEqual(['success']);

  // Razorpay retries webhooks; a repeat must change nothing.
  expect((await sendWebhook('payment.captured', payment)).status).toBe(200);
  const events = await auditEvents(booking.id);
  expect(events.filter((e) => e === 'BOOKING_CONFIRMED')).toHaveLength(1);
  expect((await fakeRazorpay.state()).refunds).toEqual([]);
});
