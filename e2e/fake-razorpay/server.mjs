// A small in-memory stand-in for Razorpay's REST API, for end-to-end tests.
//
// The app's Razorpay SDK is pointed here with RAZORPAY_API_HOST (honoured only
// for rzp_test_ keys outside production). It implements the calls the app
// makes, keeping Razorpay's units: every amount is in PAISE.
//
// /__test/* routes let the specs and the fake checkout act as the customer and
// as Razorpay's back office: pay an order, capture a pending UPI payment, or
// read what was refunded.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.FAKE_RAZORPAY_PORT || 4010);
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

if (!KEY_ID.startsWith('rzp_test_')) {
  console.error('[fake-razorpay] refusing to start without an rzp_test_ key id');
  process.exit(1);
}

const state = { orders: new Map(), payments: new Map(), refunds: new Map() };
const newId = (prefix) => `${prefix}_${crypto.randomBytes(7).toString('hex')}`;
const now = () => Math.floor(Date.now() / 1000);

function sign(orderId, paymentId) {
  return crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    // The fake checkout calls /__test/pay from the app's origin.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-forwarded-for',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function notFound(res, what) {
  send(res, 404, { error: { code: 'BAD_REQUEST_ERROR', description: `${what} does not exist` } });
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // The Razorpay SDK posts form-encoded bodies for some calls.
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

function isAuthorized(req) {
  const header = req.headers.authorization || '';
  const expected = 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
  return header === expected;
}

function createPayment({ orderId, method = 'card', status = 'captured', amount }) {
  const order = state.orders.get(orderId);
  if (!order) return null;
  const payment = {
    id: newId('pay'),
    entity: 'payment',
    order_id: orderId,
    // A test may override the captured amount to simulate a mismatch.
    amount: amount ?? order.amount,
    currency: order.currency,
    status,
    method,
    ...(method === 'upi' ? { vpa: 'success@razorpay' } : { card: { last4: '1111', network: 'Visa' } }),
    amount_refunded: 0,
    refund_status: null,
    captured: status === 'captured',
    created_at: now(),
  };
  state.payments.set(payment.id, payment);
  if (status === 'captured') order.status = 'paid';
  return payment;
}

function checkoutResponse(payment) {
  return {
    razorpay_payment_id: payment.id,
    razorpay_order_id: payment.order_id,
    razorpay_signature: sign(payment.order_id, payment.id),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') return send(res, 204, {});

  // ---- Test control -------------------------------------------------------
  if (parts[0] === '__test') {
    const body = req.method === 'POST' ? await readJson(req) : {};
    switch (parts[1]) {
      case 'health':
        return send(res, 200, { ok: true });
      case 'reset':
        state.orders.clear();
        state.payments.clear();
        state.refunds.clear();
        return send(res, 200, { ok: true });
      case 'state':
        return send(res, 200, {
          orders: [...state.orders.values()],
          payments: [...state.payments.values()],
          refunds: [...state.refunds.values()],
        });
      case 'pay': {
        // The customer completes checkout. status "created" models a UPI
        // collect request the customer has not approved yet.
        const payment = createPayment(body);
        if (!payment) return notFound(res, 'order');
        return send(res, 200, { payment, response: checkoutResponse(payment) });
      }
      case 'payments': {
        // The fake checkout polls this while a UPI request is pending.
        const payment = state.payments.get(parts[2]);
        if (!payment) return notFound(res, 'payment');
        return send(res, 200, { payment, response: checkoutResponse(payment) });
      }
      case 'capture': {
        // The customer approves a pending UPI request later.
        const payment = state.payments.get(body.paymentId);
        if (!payment) return notFound(res, 'payment');
        payment.status = 'captured';
        payment.captured = true;
        state.orders.get(payment.order_id).status = 'paid';
        return send(res, 200, { payment, response: checkoutResponse(payment) });
      }
      default:
        return notFound(res, 'test route');
    }
  }

  // ---- Razorpay API (v1) --------------------------------------------------
  if (parts[0] !== 'v1') return notFound(res, 'route');
  if (!isAuthorized(req)) {
    return send(res, 401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
  }

  const [, resource, id, action] = parts;

  if (resource === 'orders') {
    if (req.method === 'POST' && !id) {
      const body = await readJson(req);
      const order = {
        id: newId('order'),
        entity: 'order',
        amount: Number(body.amount),
        amount_paid: 0,
        currency: body.currency || 'INR',
        receipt: body.receipt,
        status: 'created',
        notes: body.notes || {},
        created_at: now(),
      };
      state.orders.set(order.id, order);
      return send(res, 200, order);
    }
    if (req.method === 'GET' && !id) {
      const receipt = url.searchParams.get('receipt');
      const items = [...state.orders.values()].filter((o) => !receipt || o.receipt === receipt);
      return send(res, 200, { entity: 'collection', count: items.length, items });
    }
    if (req.method === 'GET' && id && action === 'payments') {
      if (!state.orders.has(id)) return notFound(res, 'order');
      const items = [...state.payments.values()].filter((p) => p.order_id === id);
      return send(res, 200, { entity: 'collection', count: items.length, items });
    }
    if (req.method === 'GET' && id) {
      const order = state.orders.get(id);
      return order ? send(res, 200, order) : notFound(res, 'order');
    }
  }

  if (resource === 'payments' && id) {
    const payment = state.payments.get(id);
    if (!payment) return notFound(res, 'payment');
    if (req.method === 'GET' && !action) return send(res, 200, payment);
    if (req.method === 'POST' && action === 'refund') {
      const body = await readJson(req);
      const amount = Number(body.amount) || payment.amount;
      if (payment.status !== 'captured' || payment.amount_refunded + amount > payment.amount) {
        return send(res, 400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Refund not allowed' } });
      }
      const refund = {
        id: newId('rfnd'),
        entity: 'refund',
        payment_id: id,
        amount,
        currency: payment.currency,
        receipt: body.receipt ?? null,
        status: 'processed',
        created_at: now(),
      };
      state.refunds.set(refund.id, refund);
      payment.amount_refunded += amount;
      payment.refund_status = payment.amount_refunded >= payment.amount ? 'full' : 'partial';
      return send(res, 200, refund);
    }
  }

  return notFound(res, 'route');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-razorpay] listening on http://127.0.0.1:${PORT}`);
});
