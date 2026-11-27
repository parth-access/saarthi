// Stand-in for https://checkout.razorpay.com/v1/checkout.js in end-to-end tests.
// Playwright serves this file in place of the real script, with
// window.__FAKE_RAZORPAY_URL__ set to the fake Razorpay server.
//
// It keeps the contract BookingSystem relies on: `new Razorpay(options)`,
// `.on('payment.failed', cb)`, `.open()`, `options.handler(response)` on
// success and `options.modal.ondismiss()` when the customer closes it. The
// accepted inputs are Razorpay's published test values: card
// 4111 1111 1111 1111 and UPI id success@razorpay.
(function () {
  var TEST_CARD = '4111111111111111';
  var TEST_VPA = 'success@razorpay';

  function FakeRazorpay(options) {
    this.options = options;
    this.listeners = {};
  }

  FakeRazorpay.prototype.on = function (event, cb) {
    this.listeners[event] = cb;
  };

  FakeRazorpay.prototype.open = function () {
    var self = this; // eslint-disable-line @typescript-eslint/no-this-alias -- plain ES5 browser script
    var opts = self.options;
    var root = document.createElement('div');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Razorpay test checkout');
    root.dataset.testid = 'fake-razorpay';
    root.dataset.orderId = opts.order_id;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font:14px sans-serif';
    root.innerHTML =
      '<div style="background:#fff;padding:20px;border-radius:12px;width:320px;display:grid;gap:8px">' +
      '<strong>Razorpay (test)</strong>' +
      '<label>Card number <input name="card" autocomplete="off"></label>' +
      '<button type="button" data-pay="card">Pay with card</button>' +
      '<label>UPI ID <input name="vpa" autocomplete="off"></label>' +
      '<label><input type="checkbox" name="pending"> Approve later in my UPI app</label>' +
      '<button type="button" data-pay="upi">Pay with UPI</button>' +
      '<p data-status role="status"></p>' +
      '<button type="button" data-close aria-label="Close checkout">Close</button>' +
      '</div>';
    document.body.appendChild(root);

    var status = root.querySelector('[data-status]');
    var close = function () {
      root.remove();
    };

    root.querySelector('[data-close]').addEventListener('click', function () {
      close();
      if (opts.modal && typeof opts.modal.ondismiss === 'function') opts.modal.ondismiss();
    });

    root.querySelectorAll('[data-pay]').forEach(function (button) {
      button.addEventListener('click', function () {
        var method = button.getAttribute('data-pay');
        var pending = method === 'upi' && root.querySelector('[name=pending]').checked;
        var value = method === 'card'
          ? root.querySelector('[name=card]').value.replace(/\s+/g, '')
          : root.querySelector('[name=vpa]').value.trim();

        if (value !== (method === 'card' ? TEST_CARD : TEST_VPA)) {
          var failure = { error: { description: 'Use a Razorpay test card or UPI id', reason: 'payment_failed' } };
          if (self.listeners['payment.failed']) self.listeners['payment.failed'](failure);
          return;
        }

        var config = window.__fakeRazorpay || {};
        fetch(window.__FAKE_RAZORPAY_URL__ + '/__test/pay', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            orderId: opts.order_id,
            method: method,
            status: pending ? 'created' : 'captured',
            amount: config.capturedAmountPaise,
          }),
        })
          .then(function (res) { return res.json(); })
          .then(function (body) {
            root.dataset.paymentId = body.payment.id;
            if (pending) {
              // Like real checkout: wait for the customer to approve in their
              // UPI app, then finish. The test decides whether that happens,
              // and closing the dialog stops the wait.
              status.textContent = 'Waiting for approval in your UPI app';
              var poll = setInterval(function () {
                if (!root.isConnected) return clearInterval(poll);
                fetch(window.__FAKE_RAZORPAY_URL__ + '/__test/payments/' + body.payment.id)
                  .then(function (res) { return res.json(); })
                  .then(function (latest) {
                    if (latest.payment.status !== 'captured' || !root.isConnected) return;
                    clearInterval(poll);
                    close();
                    opts.handler(latest.response);
                  });
              }, 500);
              return;
            }
            close();
            opts.handler(body.response);
          });
      });
    });
  };

  window.Razorpay = FakeRazorpay;
})();
