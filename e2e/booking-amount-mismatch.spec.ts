import { test, expect } from '@playwright/test';
import { bookingsFor, clearFirestore, emulatorDb, seedTherapist, THERAPIST } from './support/firestore';
import { fakeRazorpay, sendWebhook, installFakeCheckout } from './support/razorpay';
import { fillDetails, newClient, payWithTestCard, pickSlot } from './support/booking';

const EXPECTED_PAISE = THERAPIST.sessionPrice * 100;

// Each captured amount differs from the 149900 paise order. assertCapturedAmountMatches
// (src/domains/payment/capturedAmount.ts) must refuse all of them.
const mismatches = [
  { label: 'the rupee figure sent as paise', paise: THERAPIST.sessionPrice },
  { label: 'one paisa short', paise: EXPECTED_PAISE - 1 },
  { label: 'the platform default price', paise: 1500 * 100 },
];

test.beforeEach(async () => {
  await clearFirestore();
  await fakeRazorpay.reset();
  await seedTherapist();
});

for (const { label, paise } of mismatches) {
  test(`refuses a captured amount of ${label} (${paise} paise)`, async ({ page }) => {
    await installFakeCheckout(page, { capturedAmountPaise: paise });
    const client = newClient('mismatch');
    await pickSlot(page, '10:00');
    await fillDetails(page, client);
    await payWithTestCard(page);

    await expect(page.getByText(`Payment amount mismatch: expected ${EXPECTED_PAISE} paise, got ${paise}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Booking Confirmed' })).toHaveCount(0);

    // The webhook carries the same short payment; it must not confirm either.
    const [booking] = await bookingsFor(client.email);
    const payment = (await fakeRazorpay.state()).payments.find((p) => p.order_id === booking.razorpayOrderId)!;
    expect(payment.amount).toBe(paise);
    expect((await sendWebhook('payment.captured', payment)).status).not.toBe(200);

    const [after] = await bookingsFor(client.email);
    expect(after.status).not.toBe('confirmed');
    expect(after.paymentStatus).not.toBe('paid');
    const stored = await emulatorDb().collection('payments').doc(booking.razorpayOrderId!).get();
    expect(stored.data()?.status).toBe('pending');
  });
}
