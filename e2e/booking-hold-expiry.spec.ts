import { test, expect, type Browser, type Page } from '@playwright/test';
import { bookingsFor, clearFirestore, expireSlotHold, seedTherapist } from './support/firestore';
import { fakeRazorpay, installFakeCheckout } from './support/razorpay';
import { expectConfirmed, fillDetails, newClient, payButton, payWithTestCard, pickSlot } from './support/booking';

const SLOT = '10:45';

test.beforeEach(async ({ page }) => {
  await clearFirestore();
  await fakeRazorpay.reset();
  await seedTherapist();
  await installFakeCheckout(page);
});

/** Customer on Review, hold lapsed, another customer took the slot. */
async function loseSlotOnReview(page: Page, browser: Browser) {
  const client = newClient('expired');
  await pickSlot(page, SLOT);
  await fillDetails(page, client);
  await expireSlotHold(SLOT);
  const other = await (await browser.newContext()).newPage();
  await pickSlot(other, SLOT);

  await payButton(page).click();
  await expect(page.getByRole('main').getByText(/reserved by another user/i)).toBeVisible();
  return client;
}

test('hold expires on Review and someone else takes the slot: no payment is taken', async ({ page, browser }) => {
  const client = await loseSlotOnReview(page, browser);

  await expect(page.getByTestId('fake-razorpay')).toHaveCount(0);
  expect(await bookingsFor(client.email)).toEqual([]);
  expect((await fakeRazorpay.state()).orders).toEqual([]);
});

test('hold expires on Review and someone else takes the slot: the customer is offered another slot', async ({ page, browser }) => {
  // Known bug: ReviewStep shows "Pick Another Slot" only for errors naming a
  // lock, expiry, availability or conflict, and this one says "reserved by
  // another user", so the customer is left with only "Go Back". Remove this
  // line once ReviewStep recognises the message.
  test.fail(true, 'ReviewStep does not offer Pick Another Slot for "reserved by another user"');

  await loseSlotOnReview(page, browser);
  await page.getByRole('button', { name: /Pick Another Slot/ }).click({ timeout: 5_000 });
  await expect(page.getByRole('button', { name: 'Select 11:30 AM' })).toBeVisible();
});

test('hold expires on Review but the slot is still free: paying still books it', async ({ page }) => {
  const client = newClient('lapsed');
  await pickSlot(page, SLOT);
  await fillDetails(page, client);
  await expireSlotHold(SLOT);

  await payWithTestCard(page);
  await expectConfirmed(page);
  const [booking] = await bookingsFor(client.email);
  expect(booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', time: SLOT });
});
