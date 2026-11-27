# Saarthi — Your Safe Space

Online therapy booking platform for India — **[saarthilife.com](https://www.saarthilife.com)**.
Clients find a therapist, book and pay for an online session, and join over Google Meet.
Therapists manage their sessions, notes, availability and earnings; the practice runs
everything from an admin console.

## Stack

| Layer | Tech |
|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion |
| Data / auth | Firebase Auth + Firestore (`asia-south2`, Delhi), Firebase Admin SDK on the server |
| Payments | Razorpay (orders, signature-verified confirm + webhook, refunds) |
| Email | Resend |
| Sessions | Google Calendar + Meet links |
| Hosting | Vercel (`bom1`, Mumbai) · background jobs via GitHub Actions |
| Monitoring | Sentry (optional), Google Analytics behind cookie consent |
| Tests | Vitest (~2,000 tests) |

## Getting started

Requires **Node 20+**.

```bash
npm install
cp .env.example .env.local   # fill in the values — see comments in the file
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Run the test suite |
| `npm run test:e2e` | Booking end-to-end tests (Playwright, see below) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |
| `npm run build` | Production build (type-check + lint run as part of it) |

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests and build on every push / PR to `main`.

### Booking end-to-end tests

`npm run test:e2e` drives the real booking wizard in Chromium, from picking a
therapist to a confirmed booking, against a fully local stack. Playwright starts
three servers itself:

| Server | Port | What it is |
|---|---|---|
| Firestore emulator | 8085 | `firebase.e2e.json`, project `demo-saarthi-e2e` (emulator-only, no real backend) |
| Fake Razorpay | 4010 | `e2e/fake-razorpay/server.mjs`: orders, payments and refunds in memory, amounts in paise |
| `next dev` | 3005 | the app, started with the test env from `e2e/env.ts` |

No real or live key is used. Every key in `e2e/env.ts` is a made-up test
value, so the suite needs no secrets locally or in CI. The app reaches the fake
gateway through `RAZORPAY_API_HOST`, which is honoured only for `rzp_test_` keys
outside production. Razorpay's checkout script is swapped for
`e2e/fake-razorpay/checkout.js`, which accepts Razorpay's published test values:
card `4111 1111 1111 1111` and UPI id `success@razorpay`.

**Before you run it**

- Java 11+ (for the emulator) and the Firebase CLI. A global `firebase` is used
  if present, otherwise `npx firebase-tools@15.15.0`.
- Install the browser once: `npx playwright install chromium`.
- Nothing else may be listening on 3005. The suite never reuses a running
  server, because one started without the test env would talk to real
  services. Stop your own `npm run dev` too if it uses the same `.next` folder.

**What it covers**

| Spec | Case |
|---|---|
| `booking-happy-path` | Pay with the test card, and with UPI; booking confirmed, order created at `price × 100` paise |
| `booking-late-upi-webhook` | UPI approved after checkout was closed: only the `payment.captured` webhook confirms it; a repeated webhook changes nothing |
| `booking-double-payment` | Two customers pay for one slot: one booking is confirmed, the other gets one full refund; a held slot is not offered to anyone else, and an abandoned checkout frees its slot once the hold lapses |
| `booking-amount-mismatch` | Captured amount ≠ order amount (rupees-as-paise, 1 paisa short, wrong price): `assertCapturedAmountMatches` refuses it, nothing is confirmed |
| `booking-hold-expiry` | Hold lapses on Review: if someone else took the slot, no order or payment is made and **Pick Another Slot** is offered; if not, paying still books it |

Useful flags: `npx playwright test booking-happy-path` (one spec),
`--headed` (watch it), `--ui` (step through), and `E2E_PORT=3015` to use
another port. On failure, traces and screenshots are in `test-results/`; open
one with `npx playwright show-trace <trace.zip>`. CI runs the suite in the
**Booking E2E** job.

## Project layout

```
src/
  app/                 Routes (App Router)
    (public)/          Marketing site, therapists, booking flow, legal pages
    (auth)/login       Sign in / register
    dashboard/         Client dashboard (sessions, receipts, wellness, profile)
    therapist/         Therapist workspace (sessions, clients, availability, earnings, profile)
    admin/             Admin console (operations, bookings, payments, refunds, therapists, system)
    api/               Route handlers — every mutation is server-side and role-checked
  domains/             Business logic: booking & payment commands, state machines, repositories
  components/          UI, grouped by area (booking, dashboard, therapist, admin, ui)
  shared/              Cross-cutting: events/outbox, scheduling, logging, validation
  lib/                 Firebase clients, auth helpers
firestore.rules        Security rules (bookings/payments are server-write-only)
firestore.indexes.json Composite indexes
vercel.json            Region + security headers (CSP lives here, not in next.config)
docs/audits/           Past security / production audits
```

## How things work

- **Auth.** Firebase Auth signs users in; `/api/auth/session` mints an httpOnly `__session`
  JWT. `verifySession` re-reads the user's role from Firestore on every request, so role
  changes and account disables take effect immediately. Email is only trusted as proof of
  booking ownership once it is **verified**.
- **Roles.** `client`, `therapist`, `admin` — set under *Admin → Users & roles*. A therapist
  account is linked to its therapist profile by sign-in email (*Admin → Therapists → Edit profile*).
- **Bookings & money.** Slots are held transactionally, paid via Razorpay, confirmed only after
  signature + gateway verification. Prices are per-therapist (defaults ₹1,500 online /
  ₹2,000 in person) and always computed on the server.
- **Side effects** (emails, calendar, reminders) go through a transactional **outbox**,
  drained by the background jobs below.
- **Privacy.** Therapists' private session notes are never shown to clients, exported, or
  emailed. Clients can download their data (*Profile → Download my data*).

## Background jobs

`/.github/workflows/scheduled-jobs.yml` calls these endpoints every 5 minutes with
`Authorization: Bearer $CRON_SECRET`:

| Endpoint | Job |
|---|---|
| `/api/cron/process-outbox` | Deliver queued emails / calendar events |
| `/api/cron/session-reminders` | Session reminder emails |
| `/api/cron/session-completion` | Auto-complete past sessions |
| `/api/cron/retry-calendar` | Retry failed Meet-link creation |
| `/api/cron/process-refunds` | Process queued refunds |

Repo settings needed: secret **`CRON_SECRET`** (same as Vercel) and variable
**`PRODUCTION_URL`** (`https://www.saarthilife.com`).
**Backup:** Vercel Cron calls `/api/cron/all` once a day (06:00 IST, `vercel.json` → `crons`),
which runs all five jobs. GitHub pauses scheduled workflows after 60 days without a push; the
daily run keeps everything moving meanwhile and — if `GITHUB_KEEPALIVE_TOKEN` and
`GITHUB_KEEPALIVE_REPO` are set — switches the GitHub schedule back on automatically.

## Deploying

- **App:** push to `main` → Vercel deploys. Set all `.env.example` keys in Vercel.
- **Firestore rules / indexes** are *not* deployed by Vercel:
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes
  ```
- **Razorpay webhook:** `https://www.saarthilife.com/api/payment/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`.

## Security notes

- CSP and security headers are defined **only** in `vercel.json`. The enforced policy no
  longer allows `unsafe-eval`; the identical *report-only* policy still reports to
  `/api/csp-report` — check the Vercel logs for "CSP violation". `unsafe-inline` remains
  (removing it needs nonces).
- Signing out denylists the session in `revoked_sessions` until it expires. Enable a
  Firestore TTL policy on `revoked_sessions.expiresAt` (and `rate_limits.expireAt`).
- Never commit `.env*` files or service-account JSON.
