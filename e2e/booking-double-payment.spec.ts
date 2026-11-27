import { test, expect, type Browser } from '@playwright/test';
import { auditEvents, bookingDate, bookingsFor, clearFirestore, confirmedBookingsAt, expireSlotHold, seedTherapist, THERAPIST } from './support/firestore';
import { fakeRazorpay, sendWebhook, installFakeCheckout } from './support/razorpay';
import { expectConfirmed, fillDetails, newClient, openCheckout, payWithTestCard, payWithUpi, pickSlot } from './support/booking';

const SLOT = '12:15';

test.beforeEach(async () => {
  await clearFirestore();
  await fakeRazorpay.reset();
  await seedTherapist();
});

async function customerPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFakeCheckout(page);
  return page;
}

test('two customers paying for one slot: one booking is confirmed, the other is refunded', async ({ browser }) => {
  const asha = newClient('first');
  const ravi = newClient('second');
  const first = await customerPage(browser);
  const second = await customerPage(browser);

  // The first customer starts a UPI collect request, then closes checkout
  // before approving it. The booking is released and the slot is free again.
  await pickSlot(first, SLOT);
  await fillDetails(first, asha);
  const firstCheckout = await payWithUpi(first, { approveLater: true });
  await expect(firstCheckout.getByRole('status')).toHaveText('Waiting for approval in your UPI app');
  const firstPaymentId = await firstCheckout.getAttribute('data-payment-id');
  await firstCheckout.getByRole('button', { name: 'Close checkout' }).click();
  await expect.poll(async () => (await bookingsFor(asha.email))[0]?.status).toBe('cancelled');

  // The second customer books the same slot and pays by card.
  await pickSlot(second, SLOT);
  await fillDetails(second, ravi);
  await payWithTestCard(second);
  await expectConfirmed(second);

  // Now the first customer approves the old UPI request. Razorpay captures it
  // and sends the webhook, for a slot that already belongs to someone else.
  const { payment } = await fakeRazorpay.capture(firstPaymentId!);
  expect((await sendWebhook('payment.captured', payment)).status).toBe(200);
  // Razorpay retries webhooks; the retry must not refund twice.
  expect((await sendWebhook('payment.captured', payment)).status).toBe(200);

  // Exactly one booking holds the slot, and it is the second customer's.
  const confirmed = await confirmedBookingsAt(SLOT);
  expect(confirmed.map((b) => b.email)).toEqual([ravi.email]);
  const [firstBooking] = await bookingsFor(asha.email);
  expect(firstBooking.status).not.toBe('confirmed');
  expect(await auditEvents(firstBooking.id)).toContain('REFUND_REQUIRED');

  // The first customer's money goes back in full, exactly once.
  await expect
    .poll(async () => (await fakeRazorpay.state()).refunds)
    .toEqual([expect.objectContaining({ payment_id: firstPaymentId, amount: THERAPIST.sessionPrice * 100, status: 'processed' })]);
});

test('a second customer cannot take a slot that is still held', async ({ browser }) => {
  const first = await customerPage(browser);
  const second = await customerPage(browser);

  await pickSlot(first, SLOT);

  // The held slot is offered to nobody else.
  await second.goto('/book');
  await second.getByRole('button', { name: new RegExp(THERAPIST.name) }).click();
  await second.getByRole('button', { name: /Individual/ }).click();
  const { dayNum, monthShort } = bookingDate();
  await second.getByRole('button', { name: new RegExp(`, ${dayNum} ${monthShort}$`) }).click();
  await second.getByRole('button', { name: /Find Slots/ }).click();
  await expect(second.getByRole('button', { name: 'Select 11:30 AM' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Select 12:15 PM' })).toHaveCount(0);
});

test('an abandoned checkout frees its slot once the hold lapses', async ({ browser }) => {
  const first = await customerPage(browser);
  const second = await customerPage(browser);
  const quitter = newClient('abandoned');
  const buyer = newClient('after-abandon');

  // The first customer opens checkout and walks away without closing it, so
  // their booking stays awaiting payment.
  await pickSlot(first, SLOT);
  await fillDetails(first, quitter);
  await openCheckout(first);
  await expect.poll(async () => (await bookingsFor(quitter.email))[0]?.status).toBe('awaiting_payment');
  await first.close();

  // Once the hold runs out the slot is offered and can be booked again.
  await expireSlotHold(SLOT);
  await pickSlot(second, SLOT);
  await fillDetails(second, buyer);
  await payWithTestCard(second);
  await expectConfirmed(second);

  const [booking] = await bookingsFor(buyer.email);
  expect(booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', time: SLOT });
  expect(await confirmedBookingsAt(SLOT)).toHaveLength(1);
});
