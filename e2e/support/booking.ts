import { expect, type Page } from '@playwright/test';
import { THERAPIST, bookingDate } from './firestore';
import { TEST_CARD, TEST_UPI_ID } from './razorpay';

export interface Client {
  name: string;
  email: string;
}

let counter = 0;
/** A unique client per test, on the reserved .test domain (never deliverable). */
export function newClient(label: string): Client {
  counter += 1;
  return { name: `E2E ${label}`, email: `e2e-${label}-${Date.now()}-${counter}@example.test` };
}

/** 24h "10:45" → the 12h label the slot buttons use, "10:45 AM". */
function time12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

let ipCounter = 0;

/** Therapist → session type → date → slot. Leaves the page on Details. */
export async function pickSlot(page: Page, time: string) {
  // Each simulated customer gets its own client address, as real customers
  // do, so the per-IP booking rate limit (5 a minute) never trips the suite.
  ipCounter += 1;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${(ipCounter % 250) + 1}` });
  await page.goto('/book');
  await page.getByRole('button', { name: new RegExp(THERAPIST.name) }).click();
  await page.getByRole('button', { name: /Individual/ }).click();

  const { dayNum, monthShort } = bookingDate();
  await page.getByRole('button', { name: new RegExp(`, ${dayNum} ${monthShort}$`) }).click();
  await page.getByRole('button', { name: /Find Slots/ }).click();

  await page.getByRole('button', { name: `Select ${time12h(time)}` }).click();
  await expect(page.locator('#booking-name')).toBeVisible();
}

/** Details form → Review. */
export async function fillDetails(page: Page, client: Client) {
  await page.locator('#booking-name').fill(client.name);
  await page.locator('#booking-email').fill(client.email);
  await page.locator('#booking-phone').fill('98765 43210');
  await page.locator('#booking-gender').selectOption('Prefer not to say');
  await page.locator('#booking-age').fill('29');
  await page.locator('#booking-consent').check();
  await page.getByRole('button', { name: /Review Request/ }).click();
  await expect(page.getByRole('heading', { name: 'Final Review' })).toBeVisible();
}

export function payButton(page: Page) {
  return page.getByRole('button', { name: /Confirm & Pay/ });
}

/** Opens checkout from Review and returns the fake checkout dialog. */
export async function openCheckout(page: Page) {
  await payButton(page).click();
  const checkout = page.getByTestId('fake-razorpay');
  await expect(checkout).toBeVisible();
  return checkout;
}

export async function payWithTestCard(page: Page) {
  const checkout = await openCheckout(page);
  await checkout.getByLabel('Card number').fill(TEST_CARD);
  await checkout.getByRole('button', { name: 'Pay with card' }).click();
}

/** UPI with success@razorpay. `approveLater` leaves the collect request pending. */
export async function payWithUpi(page: Page, opts: { approveLater?: boolean } = {}) {
  const checkout = await openCheckout(page);
  await checkout.getByLabel('UPI ID').fill(TEST_UPI_ID);
  if (opts.approveLater) await checkout.getByLabel('Approve later in my UPI app').check();
  await checkout.getByRole('button', { name: 'Pay with UPI' }).click();
  return checkout;
}

export async function expectConfirmed(page: Page) {
  await expect(page.getByRole('heading', { name: 'Booking Confirmed' })).toBeVisible({ timeout: 30_000 });
}
