import { test, expect } from '@playwright/test';
import { auditEvents, bookingsFor, clearFirestore, emulatorDb, seedTherapist, slotId, THERAPIST } from './support/firestore';
import { fakeRazorpay, installFakeCheckout } from './support/razorpay';
import { expectConfirmed, fillDetails, newClient, payWithTestCard, payWithUpi, pickSlot } from './support/booking';

test.beforeEach(async ({ page }) => {
  await clearFirestore();
  await fakeRazorpay.reset();
  await seedTherapist();
  await installFakeCheckout(page);
});

test('books a session paid with the Razorpay test card', async ({ page }) => {
  const client = newClient('card');
  await pickSlot(page, '10:00');
  await fillDetails(page, client);
  await payWithTestCard(page);
  await expectConfirmed(page);

  const [booking] = await bookingsFor(client.email);
  expect(booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', time: '10:00' });

  // The order was created in paise from the rupee price, and the captured
  // payment matched it exactly.
  const { orders, payments } = await fakeRazorpay.state();
  const order = orders.find((o) => o.id === booking.razorpayOrderId);
  expect(order?.amount).toBe(THERAPIST.sessionPrice * 100);
  expect(payments.find((p) => p.id === booking.razorpayPaymentId)?.status).toBe('captured');

  const slot = await emulatorDb().collection('locked_slots').doc(slotId('10:00')).get();
  expect(slot.data()).toMatchObject({ bookingId: booking.id, status: 'booked', isPermanent: true });
  expect(await auditEvents(booking.id)).toEqual(expect.arrayContaining(['PAYMENT_SUCCEEDED', 'BOOKING_CONFIRMED']));
});

test('books a session paid by UPI with success@razorpay', async ({ page }) => {
  const client = newClient('upi');
  await pickSlot(page, '10:45');
  await fillDetails(page, client);
  await payWithUpi(page);
  await expectConfirmed(page);

  const [booking] = await bookingsFor(client.email);
  expect(booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', time: '10:45' });
});
