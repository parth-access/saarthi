# SAARTHI — FINAL FORENSIC PRODUCTION AUDIT

**Target:** Saarthi — online therapy / mental-wellness booking platform
**Stack:** Next.js 15.1.11 (App Router), React 19, TypeScript, Firebase (Auth + Admin SDK + Firestore), Razorpay, Resend, Google Calendar/Meet, Vercel
**Audit type:** Full-system, adversarial, read-only forensic review ("try to break it")
**Date:** 2026-08-31
**Auditor stance:** Analysis only. No files were modified. Every finding is tagged with **severity** (🔴P0 / 🟠P1 / 🟡P2 / 🟢P3) and **confidence** (PROVEN / HIGH / MEDIUM / UNVERIFIED). Inferences are never presented as facts.

---

## 1. Executive Verdict

**VERDICT: 🔴 NOT SAFE (as currently configured) — conditionally shippable once the P0 set is closed.**

The application layer is, in most respects, competently engineered: server-authoritative Firestore rules, a transactional outbox, deterministic idempotency keys, HMAC-verified Razorpay verification with fetch-based ground truth, and immediate role revocation on the session path. The DDD structure is clean and the money-verification path is genuinely defensible.

However, the system **cannot be certified safe for production today** because of a small number of high-impact defects that are reachable on realistic paths:

1. **No scheduler drives the background jobs.** The outbox ret/reminder/auto-completion cron *endpoints* exist and are secured, but nothing in the repository schedules them. If no external scheduler is wired up out-of-band, failed events never retry, reminders never send, and sessions never auto-complete. (PROVEN that no in-repo scheduler exists.)
2. **Double-booking is reachable at payment-confirmation time.** The confirmation transaction stamps the permanent slot pin unconditionally and never reads the slot document, so two bookings that both survive the hold window can both confirm on the same slot. (PROVEN mechanism.)
3. **Simulated Google Meet links can reach real customers** when Google credentials are absent — a fake `meet.google.com/saa-rthi-xxxx` URL is emitted and emailed as if real. (PROVEN in code; contingent on env.)
4. **Refunds are never initiated programmatically** and refund webhooks are ignored beyond logging — the DB silently diverges from Razorpay, while user-facing copy promises automatic reversal. (PROVEN.)
5. **An unauthenticated, unthrottled email endpoint** can be driven as a branded phishing/spam relay. (PROVEN.)

None of these require exotic conditions. Close the P0/P1 set below and re-verify with a green build + test run (which could not be executed in this environment — see §2), and Saarthi moves to **SAFE WITH CONDITIONS**.

---

## 2. Methodology, Scope & Verification Limits

**Method.** Direct read of source across the repository — routes, commands/handlers, domain services, entities, state machines, repositories, event/outbox layer, Firestore rules, config, and the client booking surface. Execution paths were traced end-to-end (auth → authorization → DB writes → external APIs → retries → failure handling) rather than inferred from names. No file was modified.

**What was verified by reading code:** booking + payment entities and state machines; the full Razorpay money path (create-order → generate-link → checkout → verify → webhook → confirm/fail); the outbox processor and cron endpoints; session issuance + `verifySession` + therapist/admin authorization; slot locking (`CreateBookingCommand`, `LockSlotCommand`, `SlotReservationService.acquireLock/releaseLock`, `ConfirmBookingCommand` pin write); reschedule/cancel/decline; the token (`manage-booking`) flow; reviews, contact, reconnect; email API + `emailSender`; availability; `join-session`; admin/operations/monitoring/health routes; `firestore.rules`; `package.json`; `vercel.json`; rate limiter; logger; client `paymentService`, `BookingSystem` Razorpay handler, and `ProtectedRoute`.

**⚠️ Verification limit (must be read as a caveat on every "works" claim):** In this environment the repository could not be mounted into a shell, and delegated sub-agents were unavailable. **`next build`, `tsc`, and `vitest` could NOT be executed.** All findings are from static execution-path analysis. Before production sign-off, a green `npm run build` and `npm test` on the exact deployed commit is mandatory and is treated here as an open, unverified gate.

**Out of scope / user-asserted context (accepted, not re-litigated):** Supabase migration was aborted (Firebase-only) — confirmed by zero `src/` usage though dead deps remain; prior "duplicate payment" incident was disproven by Razorpay; Google Calendar/Meet is mid-implementation and is **not** assumed complete.

---

## 3. Critical (P0) Findings Summary

| # | Finding | Severity | Confidence |
|---|---------|----------|------------|
| P0-1 | No in-repo scheduler for cron endpoints → outbox retries, reminders, auto-completion never run | 🔴P0 | PROVEN (no scheduler) |
| P0-2 | Double-booking at confirm time — unconditional slot pin, no slot read/contention/guard | 🔴P0 | PROVEN (mechanism) / HIGH (reachability) |
| P0-3 | Simulated Google Meet links emitted & emailed as real when Google creds absent | 🔴P0 | PROVEN (code) / contingent on env |
| P1-1 | Refunds never initiated in code; refund webhook only logs; DB diverges from Razorpay | 🟠P1 | PROVEN |
| P1-2 | `/api/email` unauthenticated + unthrottled + client-controlled fallback → branded phishing/spam relay | 🟠P1 | PROVEN |

These five gate the verdict. §4–§20 give the full trace; §21 is the complete register including P2/P3.

---

## 4. Architecture & Data Flow Overview

**Shape.** Route handlers validate input (Zod) and authenticate, then delegate to command handlers, which drive domain services → repositories → Firestore. State changes flow through two state machines (`BookingStateMachine`, `PaymentStateMachine`) that emit domain events via a dual dispatch (`DomainEvents` for internal listeners + a central `EventBus`), with durable side-effects recorded through a transactional **outbox** (`outbox_events`) using deterministic event IDs.

**Money path (happy):** client creates booking → server pins a *temporary* 10-min hold on `locked_slots/{therapistId_date_time}` and creates a Razorpay order bound to the booking (receipt `receipt_<bookingId>` + `notes.bookingId`) → client pays via Razorpay checkout → `/api/payment/verify` runs HMAC signature verification + `fetchPayment` ground-truth → `ConfirmBookingCommand` transitions booking `confirmed`, payment `paid`, and stamps a *permanent* slot pin → post-commit outbox event fans out confirmation email + calendar sync.

**Server-authoritative model (strong point):** `firestore.rules` set `bookings`, `locked_slots`, `payments` to `allow write: if false` — all mutations go through the Admin SDK server-side. Default-deny elsewhere. This is the single most important thing the codebase gets right and it neutralizes a large class of client-tampering attacks.

**Where it breaks (preview):** the reliability of everything *after* commit depends on the outbox being drained by a scheduler that the repo does not configure (§12); and the slot's permanent pin is written without re-reading the slot, so the concurrency guarantee that holds at *creation* time is lost at *confirmation* time (§7).

---

## 5. Authentication & Session Management

**Design.** `POST /api/auth/session` verifies a Firebase ID token, reads the user's role from the `users` collection, signs a custom HS256 JWT `{uid,email,role}` (jose), and sets it as an httpOnly `__session` cookie (secure in prod, 5-day expiry). `verifySession` verifies that JWT and then **re-fetches the live role from the `users` collection** — so the role embedded in the JWT is *not* trusted; the DB is authoritative. A fallback path verifies a raw Firebase ID token with `verifyIdToken(session, true)` (checkRevoked).

**Verdict: sound, with two minor residuals.**

- ✅ **Immediate role revocation** — because `verifySession` re-reads the DB role, a demoted admin loses access on the next request. (PROVEN; this corrects an earlier suspicion of stale roles.)
- 🟢 **P3 / MEDIUM — No per-token revocation.** A stolen `__session` cookie remains valid until its 5-day expiry; there is no server-side deny-list or session-version check. Role changes are caught, but a leaked token cannot be individually killed.
- 🟢 **P3 / PROVEN — No explicit `sameSite`.** The cookie relies on the framework's `Lax` default. Acceptable for this app's flows, but should be set explicitly.

---

## 6. Authorization & Access Control (IDOR / RBAC)

**Overall: strong, with one consistency defect.**

- ✅ `checkTherapistAccess` (`therapist/_lib/authCheck.ts`): admin passes; a therapist is resolved by `authId == uid` and must own `targetTherapistId`, else 403. Sound ownership enforcement.
- ✅ `reviewService.submitReview`: transaction verifies booking ownership (`userId == uid` or email match) **and** requires `status === 'completed'`, keyed by deterministic `review_<bookingId>` (one per booking). No IDOR. (PROVEN)
- ✅ `join-session`: fails closed; authorizes student (uid/email), therapist (authId), admin. Good.
- 🟡 **P2 / MEDIUM — Inconsistent admin model.** `admin/calender/retry` and `admin/reminders/send` authorize via **Firebase custom claims** (`decodedToken.role === 'admin' || decodedToken.admin`), whereas the rest of the system authorizes via the **`users`-collection role**. If custom claims are never provisioned, these endpoints 403 legitimate admins (fail-closed → functionally broken, not a breach). Two sources of truth for "who is admin" is a latent operational hazard.
- 🟢 **P3 / PROVEN — `payments` read rule dead.** `firestore.rules` gates `payments` reads on `resource.data.userId`, but Payment docs carry no `userId` field, so non-admin reads always deny. Harmless (server reads via Admin SDK), but the rule is misleading.

---

## 7. Slot Locking & Concurrency — Double-Booking Analysis

This is the most important integrity question for a booking platform, and it is where the strongest guarantee **degrades between creation and confirmation.**

**At creation (`CreateBookingCommand`) — correct.** The transaction `t.get(slotRef)` first, rejects `status:'booked'`/`isPermanent`, deletes expired holds, honors idempotent retries by `lockId`, and otherwise writes a **temporary** hold (`bookingId`, `expiresAt = now+10min`, *not* permanent). Because every concurrent creator reads the same slot doc, Firestore's optimistic concurrency **serializes** them — two simultaneous creations for one slot cannot both succeed. ✅

**Guest holds (`LockSlotCommand` → `acquireLock`) — correct.** `acquireLock` reads the slot, refuses if `bookingId || status:'booked' || isPermanent`, and respects an unexpired hold owned by another user. It coordinates correctly with creation pins. ✅

**At confirmation (`ConfirmBookingCommand`) — BROKEN invariant.**

```
// inside the confirm transaction — no t.get(slotRef) anywhere
transaction.set(slotRef, { ...data, bookingId, status:'booked', isPermanent:true, ... });
```

The confirm transaction reads the **booking** doc but **never reads the slot doc**, and the pin is written with an unconditional `set`. Two consequences:

1. **No contention on the slot.** Because the slot ref is never read in the transaction, concurrent confirmations for the same slot do not conflict at the Firestore level — both commit, last-writer-wins on the pin.
2. **No "already pinned to another booking" guard.** Confirmation checks the booking's own `razorpayOrderId`, `paymentStatus`, and `status`, but never checks whether the slot already belongs to a *different* confirmed booking.

**🔴 P0-2 — Reachable double-booking (PROVEN mechanism / HIGH reachability).** Repro:
1. Booking **A** created → 10-min hold on the slot. User A abandons checkout.
2. Hold expires. (No cleanup cron; the doc lingers — see §12.)
3. Booking **B** created for the same slot: sees the expired hold, deletes it, writes its own hold. **A still exists** as `awaiting_payment` with a valid Razorpay order.
4. User A returns and pays their still-valid order → `ConfirmBookingCommand(A)` confirms A and pins the slot to A.
5. User B pays → `ConfirmBookingCommand(B)` confirms B and **overwrites** the pin to B.

Result: **two `confirmed` + `paid` bookings on one slot**; the pin reflects only the last confirmer; both customers hold a paid session. The abandonment-then-return window is an ordinary production event (abandoned carts), so this is not a theoretical race. The fix is to `t.get(slotRef)` inside the confirm transaction and refuse/branch when it is already permanently pinned to a different `bookingId`.

---

## 8. Booking Lifecycle & State Machine

`BookingStateMachine.VALID_TRANSITIONS` is explicit and default-deny (unknown transitions throw `InvalidBookingTransitionError`). Notable edges:

- `confirmed → [completed, cancelled, rejected, rescheduled, no_show]`
- `cancelled → [awaiting_payment, pending_payment]` — deliberately allows a customer to retry payment and regenerate a link after a cancellation.
- `expired → [slot_locked, awaiting_payment]`; terminal states `completed`, `rejected`, `no_show`.

**Event dispatch is fire-and-forget by design.** Both `DomainEvents.dispatch(...)` and `EventBus.publish(...)` are called with `.catch()` swallowing async errors and a `try/catch` around the synchronous call, so a listener throwing cannot corrupt the caller. Domain services pass `skipEventBus:true` and instead record an **outbox** event inside the same transaction — the durable path. This separation (best-effort in-process events vs. durable outbox) is a genuinely good pattern. ✅

- 🟢 **P3 / PROVEN — PII minimization in events is thoughtful.** `BookingStateMachine` builds a `sanitizedBookingSummary` (no free-text mental-health disclosures) for the central `EventBus`, while retaining the full instance only for internal domain handlers. Good privacy instinct.
- ℹ️ `Booking.failPayment` transitions `confirmed → cancelled` **only when not already confirmed-and-paid**; combined with `FailPaymentCommand`'s `confirmed && paid` guard, a paid booking cannot be force-cancelled by the failure path. (Corrects an earlier P0 suspicion — the guard is present. PROVEN.)

---

## 9. Payment Money Path (Razorpay)

**This is the most defensible part of the system.** Verified controls:

- ✅ **Signature verification + ground truth.** `ConfirmBookingCommand` calls `razorpayGateway.fetchPayment` and rejects if `order_id` mismatches the expected order or if status is not `captured`/`authorized`. The webhook independently verifies the `x-razorpay-signature` HMAC-SHA256 over the raw body before acting. Order↔booking binding via `receipt_<bookingId>` + `notes.bookingId` + `findByOrderId`.
- ✅ **Idempotent confirmation.** The confirm transaction exits silently if `paymentStatus === 'paid'`, and handles the `already-confirmed-but-unpaid` reconciliation branch. `Payment.confirm()` throws on a *conflicting* `razorpayPaymentId`. Webhook retries and double-clicks converge safely.
- ✅ **Amount cannot be tampered client-side.** Razorpay charges the *order* amount, and the order is created server-side via `calculateBookingPrice` in `CreatePaymentOrderCommand`. The client checkout `amount`/`key` are display only.
- ✅ **Compensating transaction** on order-creation failure in `CreateBookingCommand` (deletes booking, hold, and outbox event; performs reads before writes).

**Weaknesses:**
- 🟡 **P2 / MEDIUM — `/api/payment/fail` is unauthenticated.** It is called from the client `ondismiss`/`payment.failed` handlers, so it accepts `{bookingId?, orderId?, reason?}` with no auth. `FailPaymentCommand` guards `confirmed && paid`, so a *paid* booking is safe, but an attacker who learns another user's high-entropy `bookingId`/`orderId` (e.g., leaked via a forwarded confirmation email or the `manage-booking` GET) could force-fail a victim's in-progress `awaiting_payment` booking. Exploitability is bounded by id entropy (Firestore 20-char auto-ids, Razorpay order ids), hence P2 not P1.
- 🟢 **P3 / PROVEN — Non-constant-time signature compare.** The webhook (and verify path) compare HMACs with `!==` rather than `crypto.timingSafeEqual`. Network jitter makes this largely theoretical, but it should use a constant-time compare.
- 🟢 **P3 / PROVEN — Webhook 500 leaks `error.message`** in the response body (post-signature-check, Razorpay-only caller). Low impact; still avoid.

---

## 10. Refunds & Financial Reconciliation

**🟠 P1-1 — There is no programmatic refund anywhere in the codebase (PROVEN).**

- The only refund code is `Payment.refund()` (an entity method that flips status to `refunded` and stamps `refundedAt`) — **it is never called from any route, command, or webhook.** A repo-wide search for Razorpay refund APIs (`refunds.create`, `payments.refund`, `initiateRefund`, etc.) returns nothing.
- The `refund.processed` webhook branch **only logs** `refundId`/`paymentId`; it does **not** update the payment or booking. So even when an operator issues a refund manually in the Razorpay dashboard, the app's Firestore state never reflects it — `payment.status` stays `paid`, the booking stays `confirmed`. **Silent state divergence between Razorpay and the DB.**
- Meanwhile the `payment-failed` email tells users the amount is "typically reversed automatically by your bank within 5-7 business days," and the cancellation flow (`confirmed → cancelled`) never triggers a refund. **A confirmed, paid customer who cancels is not refunded by any code path.**

For a healthcare-adjacent paid service in India, absent/undriven refunds are both a customer-trust and a potential regulatory/chargeback exposure. This must be closed (or refunds must be *explicitly* declared a manual back-office process, with the "automatic reversal" copy corrected) before launch.

---

## 11. Transactional Outbox & Event Reliability

**Design (good).** `OutboxProcessor.processEvent` runs an atomic claim transaction (sets `processing`, increments `attempts`, checks `nextAttemptAt`, lock staleness `LOCK_TIMEOUT_MS=60s`, and `maxAttempts`), dispatches to `EventBus` **outside** the transaction with `throwOnError:true`, then marks `processed`, or on failure schedules a `pending` retry with exponential backoff, or dead-letters to `dead` at `maxAttempts` (default 5). Deterministic event IDs make recording idempotent. At-least-once delivery with idempotent listeners is the correct contract. ✅

**The fatal dependency:** retries and dead-letter recovery only happen when `processEvent`/`processBatch` is **invoked**. Two invocation sources exist:
1. **Inline post-commit** — `CreateBookingCommand` and `ConfirmBookingCommand` call `OutboxProcessor.processEvent(...)` fire-and-forget after commit. This handles the *first* attempt on the happy path only.
2. **`/api/cron/process-outbox`** — drains `processBatch(25)`; this is the *only* thing that retries failed events and clears the backlog.

Since the first attempt is fire-and-forget (not awaited to completion in a way that survives function teardown), **any event that fails its first inline attempt is only ever retried by the cron** — which nothing schedules (§12). Net effect: **failed outbox events are effectively permanent unless the cron is externally driven.** (PROVEN given §12.)

---

## 12. Scheduled Jobs / Cron & Background Processing

**🔴 P0-1 — The cron endpoints exist and are secured, but nothing schedules them (PROVEN).**

- Three secured endpoints exist: `/api/cron/process-outbox`, `/api/cron/session-reminders`, `/api/cron/session-completion`, each gated by `verifyCronAuth` (requires exactly `Authorization: Bearer <CRON_SECRET>`; 500 if the secret is unconfigured, 401 on mismatch). The auth is correct and well-tested. ✅
- **`vercel.json` contains NO `crons` array** (PROVEN). **There is no `.github/workflows/` directory** (PROVEN — glob returns nothing). There is no other in-repo scheduler manifest.
- Therefore, unless an **external** scheduler (cron-job.org, EasyCron, an uptime monitor, a separate infra repo) is pointed at these URLs out-of-band — which cannot be verified from this repository (**UNVERIFIED**) — then:
  - **Outbox retries never run** → any first-attempt failure (transient Firestore/Resend/Calendar error) is stranded forever (§11).
  - **Session reminders never send** → the reminder emails the code carefully builds are never dispatched.
  - **Session auto-completion never runs** → `confirmed` bookings never transition to `completed`, which in turn means the review flow (which requires `status==='completed'`) is unreachable for most sessions, and any completion-driven analytics stall.

**Expired-lock cleanup** has no dedicated cron either; it relies on *opportunistic* deletion inside `GET /api/availability` and on the next `CreateBookingCommand` for that slot. This is a partial mitigation, but slots that are never re-queried keep stale hold docs.

This is the single most consequential production gap: the code is "cron-ready" but the deployment is not "cron-driven." A one-line `crons` block in `vercel.json` (or a documented external scheduler) is required, and its presence must be verified in the deployed project settings.

---

## 13. Email Subsystem (Deliverability, Auth, Abuse)

**Delivery mechanics (good).** `sendEmailWithRetry` is idempotent via an `emails/{email_<bookingId>_<type>}` doc (skips if already `sent`), retries 3× with backoff, emits `EmailEnqueued/EmailSent/EmailFailed`, and *simulates* send when `RESEND_API_KEY` is absent. Field values are HTML-escaped in the templated branches. ✅

**🟠 P1-2 — `/api/email` is an abusable, unauthenticated, unthrottled relay (PROVEN).**

- The route only requires auth for `booking-confirmed` and `booking-declined`. The types **`booking-received`, `booking-rescheduled`, and `therapist-notification` are accepted with no authentication**, and the route has **no rate limiting** at all.
- `sendEmailAction` loads the booking by `bookingId`; **if the booking is not found it falls back to client-supplied `bookingDetails`** (name/email/date/time). So an unauthenticated caller supplying a random `bookingId` + attacker-chosen `bookingDetails.email` can send a **Saarthi-branded** `booking-received`/`booking-rescheduled` email to **any recipient**. Varying `bookingId` defeats the per-doc idempotency dedupe, so volume is unbounded.
- Impact: phishing/spam from the `saarthilife.com` sender domain, Resend quota exhaustion, and sender-reputation/deliverability damage for legitimate mail. (`therapist-notification` currently has no branch in `sendEmailAction` and throws, so the practically abusable types are `booking-received` and `booking-rescheduled`.)
- `GET /api/email` correctly `requireAdmin` (logs, limit 100). The fix is to authenticate (or sign/nonce) all send types and rate-limit the endpoint.

---

## 14. Google Calendar / Meet Integration

**🔴 P0-3 — Fake Meet links can be presented and emailed as real (PROVEN in code; contingent on env).**

- The integration uses `googleapis` OAuth2 with a refresh token. When the `GOOGLE_*` env vars are **missing**, it falls back to **SIMULATED** mode, fabricating a calendar id (`gcal_...`) and a **plausible-looking but non-functional** meeting URL of the form `https://meet.google.com/saa-rthi-<last4>`.
- `GET /api/bookings/join-session`: for a confirmed booking with no stored `meetingUrl`, it calls `createOrSyncCalendarEvent` **on demand** — in simulated mode this returns the fake link, which is then surfaced to the user (and, via the confirmation/reminder emails, delivered to the customer as their session link).
- For a therapy platform, a paying client arriving at a dead Meet URL at appointment time is a severe trust and care-continuity failure. The simulation is fine for local/dev, but there is no production guard that *refuses* to emit a simulated link. Before launch: verify `GOOGLE_*` creds are present in production, and make simulated mode **hard-fail closed** (or clearly flag "link pending") rather than emit a fake URL.

---

## 15. Reschedule & Cancellation Flows

- **Therapist reschedule** (`/api/bookings/reschedule`): `requireTherapist`, rate-limited 10/60s, Zod, `RescheduleBookingCommand`. Sound entry.
- **Token (customer) reschedule** (`POST /api/manage-booking`): resolves the booking by 72-hex `bookingToken`, then `RescheduleBookingCommand({isTokenFlow:true})`. The route itself does **not** re-check `invalidToken` on POST (it relies on the command); the GET path does check it. Worth confirming the command enforces token validity on the write path.
- `Booking.reschedule` refuses on `cancelled/rejected/completed`, preserves `originalDate/Time` + `rescheduleHistory`. ✅
- 🟡 **P2 / HIGH — Availability default mismatch enables "phantom" reschedule slots.** `GET /api/availability` defaults **CLOSED** (empty slots) when a therapist has no rules, but `SlotReservationService.isSlotInTherapistAvailability` defaults **OPEN**. A reschedule validated by the latter can place a session in a slot the booking UI would never display, i.e., outside the therapist's intended availability. These two "what is a valid slot" definitions must be reconciled to one source of truth.
- 🟢 **P3 / PROVEN — `manage-booking` token has no TTL.** The `bookingToken` is a long-lived bearer credential (no expiry, no rotation). Combined with no PII redaction in logs (§18), tokens can also end up in log storage. Consider TTL + rotation.
- ℹ️ Note: no listener subscribes to `BookingRescheduled` for calendar/email side-effects via the outbox in the paths reviewed — reschedule notifications appear to depend on the (unscheduled) email path. Worth confirming reschedules actually notify both parties end-to-end.

---

## 16. Input Validation & API Surface

- ✅ **Zod validation** is used consistently at route boundaries (bookings, reviews, contact, email schema, reschedule).
- ✅ **Anti-spoofing on create**: `POST /api/bookings/create` overrides client email/name with authenticated token claims when present; guests share `userId='guest'` and must use the token flow.
- ✅ **Contact form** is well-hardened: rate-limited (5/15min), honeypot, Zod, `escapeHtml` on all fields, stores + notifies + auto-replies.
- 🟡 **P2 / PROVEN — Email HTML injection via admin notifications.** `/api/reconnect` and `/api/reschedule` interpolate client-supplied `userName`/`therapistName`/`bookingId` into admin-facing email HTML **without escaping** (e.g., `reschedule/route.ts`: `<p><strong>${userName}</strong> (${userEmail}) wants to reschedule booking <strong>${bookingId}</strong>.`). An attacker can inject markup into the email the admin opens (content/tracking injection; limited by the mail client's HTML handling). Escape these like the contact route does.
- 🟡 **P2 / PROVEN — `/api/operations/search` is a scale bomb.** `requireAdmin`, but it fetches the **entire** `bookings`, `emails`, and `timelines` collections with **no limit** and filters in JS. At production data volume this is a memory/cost/timeout hazard (and a self-inflicted DoS if an admin hammers it). Push filters into Firestore queries with limits.
- 🟢 **P3 / PROVEN — `error.message` leakage** in several routes (`operations/replay`, `reconnect`, webhook, reschedule-request). Prefer opaque errors + server-side logging.
- ℹ️ `/api/operations/replay` (`requireAdmin`) can publish an **arbitrary `eventName` directly to `EventBus`**, bypassing outbox idempotency. Admin-only, so acceptable as an ops tool, but it is a foot-gun (duplicate side-effects) and should be used with care.

---

## 17. Rate Limiting & Abuse Resistance

🟡 **P2 / PROVEN — Rate limiting is per-instance and trivially bypassable.** `_lib/rateLimit.ts` is an in-memory `Map` keyed `route:ip`, where `ip` comes from `x-forwarded-for`.

- **Per-serverless-instance**, not global — Vercel fans requests across instances, so the effective limit is `configured_limit × instance_count`, and cold starts reset counters.
- **`x-forwarded-for` is client-spoofable** — an attacker rotates the header to get a fresh bucket per request.

Consequently the create/lock/contact limits are best-effort UX throttles, **not** a security control. The unauthenticated, *unthrottled* `/api/email` (§13) is the more urgent gap. For real protection, use a shared store (e.g., Firestore/Upstash) keyed on a trusted identity or Vercel's platform edge limiting.

---

## 18. Privacy, PII, Logging & DPDP Compliance

Saarthi handles **sensitive mental-health context** (client names, emails, phones, session details, and free-text disclosures), which places it squarely under India's DPDP Act expectations for sensitive personal data.

- 🟡 **P2 / PROVEN — No PII redaction in logs.** `_lib/logger.ts` serializes `data` objects verbatim in production JSON logs. Across the codebase those objects routinely include emails, names, phone numbers, `bookingId`s, and — critically — **`bookingToken`s and management tokens** (e.g., `manage-booking` logs invalid/invalidated token attempts with the token value). Bearer credentials and PII in log storage is both a leakage vector and a DPDP concern. Introduce a redaction layer (allowlist fields; mask email/phone/token).
- ✅ **Good instinct elsewhere:** the `EventBus` payload is sanitized to a non-PII summary (§8), and email template fields are escaped. The logging gap is the main privacy weak point.
- 🟢 **P3 / PROVEN — `GET /api/health` info disclosure.** Public endpoint exposes env-var presence booleans, uptime, Firestore/Resend status, and `lastError` message. Minor reconnaissance value; consider gating detail behind auth.

---

## 19. Frontend Trust Boundaries

- ✅ **Client is not trusted for money.** `paymentService` calls server endpoints; the Razorpay `handler` posts `{razorpay_payment_id, order_id, signature}` to `/api/payment/verify` for server-side verification. Amount/key in the checkout options are display-only and cannot change the charged amount (§9).
- ✅ **`ProtectedRoute` is cosmetic-only and that's fine.** It is a client `useEffect` redirect; a determined user can bypass it, but it renders a loader (not protected content) while redirecting, and every dashboard's data comes from server APIs that enforce `verifySession`. Defense-in-depth note only. (🟢P3)
- ℹ️ `ondismiss`/`payment.failed` client handlers call `reportPaymentFailure` → `/api/payment/fail` (the unauthenticated endpoint discussed in §9). This explains the endpoint's open design but does not justify it.

---

## 20. Infrastructure, Config & Dependencies

- 🟡 **P2 / PROVEN — Unpinned dependency `@google/genai: "latest"`.** A floating `latest` on a code-executing dependency is a supply-chain risk (a compromised or breaking release lands silently on the next install/build). Pin it.
- 🟢 **P3 / PROVEN — Dead Supabase deps.** `@supabase/ssr` and `@supabase/supabase-js` remain in `package.json` with zero `src/` usage (confirms the aborted migration; remove to reduce surface).
- 🟡 **P2 / MEDIUM — `vercel.json` SPA rewrite leftover.** `{"source":"/(.*)","destination":"/index.html"}` is an SPA-style catch-all that is anomalous for a Next.js App Router deployment. It may be inert (Next routing generally takes precedence) or may misroute; verify it does not shadow routes. Build verification (§2) would settle this.
- ✅ **Strong security headers** in `vercel.json`: CSP (scoped to Razorpay/Google/Sentry/GA), `X-Frame-Options: DENY`, HSTS w/ preload, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- ✅ **Firestore rules** are default-deny and server-authoritative (§4, §6).
- ⚠️ **Build/test gate is UNVERIFIED (§2).** `next build`, `tsc`, and `vitest` were not runnable here. There are meaningful test suites present (e.g., `cronAuth.test.ts`, `cronEndpoints.test.ts`, `Payment.test.ts`), which is a positive signal, but a green run on the deployed commit remains a required, unconfirmed pre-launch gate.

---

## 21. Consolidated Findings Register

| ID | Severity | Confidence | Area | Finding | Fix (one-line) |
|----|----------|-----------|------|---------|----------------|
| P0-1 | 🔴P0 | PROVEN (no scheduler) / UNVERIFIED (external) | Cron/Reliability | No in-repo scheduler drives `process-outbox` / `session-reminders` / `session-completion` → retries, reminders, auto-completion never run | Add `crons` to `vercel.json` (or verify external scheduler); confirm in deployed settings |
| P0-2 | 🔴P0 | PROVEN (mechanism) / HIGH (reachability) | Concurrency | Confirm-time slot pin is unconditional `set` with no slot read → double `confirmed+paid` on one slot after hold-expiry+return | `t.get(slotRef)` in confirm tx; refuse if pinned to a different `bookingId` |
| P0-3 | 🔴P0 | PROVEN (code) / env-contingent | Calendar/Meet | Simulated `meet.google.com/saa-rthi-xxxx` links emitted & emailed as real when `GOOGLE_*` absent | Fail-closed in prod; verify creds; never emit simulated link to customers |
| P1-1 | 🟠P1 | PROVEN | Refunds | No programmatic refund anywhere; `refund.processed` only logs; DB never marks refunded despite "auto-reversal" copy | Implement refund initiation + reconcile webhook, or declare manual + fix copy |
| P1-2 | 🟠P1 | PROVEN | Email | `/api/email` unauthenticated + unthrottled + client `bookingDetails` fallback → branded phishing/spam relay | Auth all send types; rate-limit; drop arbitrary-recipient fallback |
| P2-1 | 🟡P2 | PROVEN | Rate limiting | In-memory per-instance limiter keyed on spoofable `x-forwarded-for` → bypassable | Shared store keyed on trusted identity / platform edge limiting |
| P2-2 | 🟡P2 | HIGH | Availability | `availability` defaults CLOSED vs `isSlotInTherapistAvailability` defaults OPEN → phantom reschedule slots | Single source of truth for slot validity |
| P2-3 | 🟡P2 | PROVEN | Ops/Scale | `/api/operations/search` loads entire collections, filters in JS | Firestore queries + limits/pagination |
| P2-4 | 🟡P2 | PROVEN | Privacy | Logger writes PII + management tokens unredacted to prod logs | Redaction/allowlist layer; mask tokens/email/phone |
| P2-5 | 🟡P2 | PROVEN | Injection | Client strings injected unescaped into admin email HTML (`reconnect`, `reschedule`) | Escape all interpolated fields |
| P2-6 | 🟡P2 | MEDIUM | AuthZ | `admin/calender/retry` + `reminders/send` use Firebase custom claims vs users-collection role → admins locked out if unprovisioned | Unify on one admin authority |
| P2-7 | 🟡P2 | PROVEN | Payments | `/api/payment/fail` unauthenticated → force-fail a victim's pending booking if id known | Authenticate or bind to session/order proof |
| P2-8 | 🟡P2 | PROVEN | Supply chain | `@google/genai: "latest"` unpinned | Pin to an exact version |
| P2-9 | 🟡P2 | MEDIUM | Config | `vercel.json` SPA catch-all rewrite anomalous for App Router | Verify/remove |
| P3-x | 🟢P3 | PROVEN | Misc | No per-token session revocation; cookie no explicit `sameSite`; `manage-booking` token no TTL; non-constant-time HMAC compare; `error.message` leaks; `/health` info; dead Supabase deps; dead `payments` read rule | Harden opportunistically |

**Verification gate (UNVERIFIED):** `next build` / `tsc` / `vitest` not runnable in this environment (§2) — must be green on the deployed commit before sign-off.

---

## 22. Final Architecture Assessment

**Can Saarthi operate safely in production? Not today — but the distance to "yes" is short and well-defined.**

The underlying architecture is sound and, in several places, genuinely above average for a product at this stage: a server-authoritative Firestore model with default-deny rules; a Razorpay money path that verifies signatures *and* fetches ground truth *and* is idempotent under retries; a transactional outbox with deterministic keys and dead-lettering; immediate role revocation; PII-minimized event payloads; and a compensating transaction on the create path. Whoever built the payment-verification and outbox layers understood the failure modes.

The problem is not the design — it is that **the reliability and integrity guarantees the design promises are not fully wired up in the running system**, and a few endpoints trust the network more than they should. Specifically:

- The outbox is durable but **undrained** (no scheduler) — so "eventually consistent" becomes "never consistent" on the first hiccup.
- The slot invariant holds at creation but is **dropped at confirmation** — so the one thing a booking system must never do (sell the same slot twice) is reachable.
- The Meet integration will happily hand a paying client a **dead link** if creds are missing.
- Money can go out (capture) but **cannot come back** in code (refunds).
- One email endpoint is an **open, branded relay**.

None of these needs a rewrite. In priority order, the pre-launch checklist is:

1. **Schedule the crons** (or verify + document the external scheduler) and confirm outbox drain + reminders + auto-completion actually fire in production.
2. **Make confirmation slot-safe** — read the slot inside the confirm transaction and reject a foreign permanent pin.
3. **Fail-closed on simulated Meet links**; verify Google creds in prod.
4. **Decide and implement the refund story** (automated or explicitly-manual) and align user-facing copy.
5. **Lock down `/api/email`** (auth + rate limit + no arbitrary-recipient fallback).
6. Then work the P2 set (rate limiting, availability parity, search scaling, log redaction, email-HTML escaping, admin-auth unification) and **run a green build + full test suite** on the exact deployed commit (the one gate this audit could not execute).

Close items 1–5, verify item 6's build/test gate, and the verdict moves from **NOT SAFE** to **SAFE WITH CONDITIONS**. The foundations are strong enough that this is achievable in a focused hardening pass rather than a re-architecture.

*— End of report. Prepared read-only; no source files were modified. Claims are bounded by the static-analysis and build-verification limits stated in §2.*







