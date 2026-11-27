import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { APP_URL, FAKE_RAZORPAY_URL, RAZORPAY_WEBHOOK_SECRET } from '../env';

export const TEST_CARD = '4111 1111 1111 1111';
export const TEST_UPI_ID = 'success@razorpay';

const CHECKOUT_SCRIPT = path.join(__dirname, '..', 'fake-razorpay', 'checkout.js');

export interface FakePayment {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  amount_refunded: number;
  refund_status: string | null;
}
export interface FakeRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
}
export interface FakeState {
  orders: Array<{ id: string; amount: number; receipt: string; status: string }>;
  payments: FakePayment[];
  refunds: FakeRefund[];
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${FAKE_RAZORPAY_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`fake Razorpay ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const fakeRazorpay = {
  reset: () => call('/__test/reset', {}),
  state: () => call<FakeState>('/__test/state'),
  /** The customer approves a pending UPI collect request in their UPI app. */
  capture: (paymentId: string) => call<{ payment: FakePayment }>('/__test/capture', { paymentId }),
};

/**
 * Serves the fake checkout in place of checkout.razorpay.com, so no test ever
 * reaches the real gateway. `capturedAmountPaise` makes the next payment
 * capture a different amount from the order (the mismatch case).
 */
export async function installFakeCheckout(page: Page, opts: { capturedAmountPaise?: number } = {}) {
  const script = await fs.readFile(CHECKOUT_SCRIPT, 'utf8');
  await page.addInitScript(
    ({ url, amount }) => {
      (window as unknown as Record<string, unknown>).__FAKE_RAZORPAY_URL__ = url;
      (window as unknown as Record<string, unknown>).__fakeRazorpay = { capturedAmountPaise: amount };
    },
    { url: FAKE_RAZORPAY_URL, amount: opts.capturedAmountPaise },
  );
  await page.route('https://checkout.razorpay.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: script }),
  );
}

/** Sends a webhook to the app exactly as Razorpay would, HMAC-signed. */
export async function sendWebhook(event: string, payment: FakePayment): Promise<Response> {
  const body = JSON.stringify({
    entity: 'event',
    event,
    payload: { payment: { entity: payment } },
    created_at: Math.floor(Date.now() / 1000),
  });
  const signature = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  return fetch(`${APP_URL}/api/payment/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
    body,
  });
}
