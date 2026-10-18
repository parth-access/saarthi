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
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type-check |
| `npm run build` | Production build (type-check + lint run as part of it) |

CI (`.github/workflows/ci.yml`) runs type-check, lint, tests and build on every push / PR to `main`.

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
⚠️ GitHub pauses scheduled workflows after 60 days without a push — any push re-arms them.

## Deploying

- **App:** push to `main` → Vercel deploys. Set all `.env.example` keys in Vercel.
- **Firestore rules / indexes** are *not* deployed by Vercel:
  ```bash
  firebase deploy --only firestore:rules,firestore:indexes
  ```
- **Razorpay webhook:** `https://www.saarthilife.com/api/payment/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`.

## Security notes

- CSP and security headers are defined **only** in `vercel.json`. A stricter
  *report-only* policy (no `unsafe-eval`) reports to `/api/csp-report`; check the Vercel
  logs for "CSP violation" before promoting it.
- Never commit `.env*` files or service-account JSON.
