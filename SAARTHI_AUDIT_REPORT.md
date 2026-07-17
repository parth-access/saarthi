# Saarthi - Architecture & Production Audit Report

**Date:** July 2024
**Reviewer:** Principal Software Architect / Staff Backend Engineer
**Scope:** Full codebase review, focusing on DDD architecture, production readiness, and system reliability.

---

## 1. Architecture Review

The project has undergone a significant transformation toward Domain Driven Design (DDD) and CQRS-lite. While the structure is ambitious and logically separated into domains (`booking`, `payment`, `audit`), the **implementation fundamentally violates Clean Architecture principles**.

*   **Layer Violations (Critical):** Command handlers (`CreateBookingCommandHandler.ts`) import `adminDb` and manage Firestore `Transaction` blocks directly. This tightly couples the application/domain layer to the persistence infrastructure, entirely defeating the purpose of the Repository Pattern.
*   **Infrastructure Leaks:** Domain services (e.g., `BookingDomainService.awaitPayment(booking, t)`) accept a Firestore `Transaction` object as an argument. The domain layer should have absolutely no knowledge of Firestore types.
*   **Split Brain Logic (Anemic vs Rich):** There are two entirely different ways to create a booking. `src/server/services/BookingService.ts` contains a giant procedural function (`createBooking`), while `CreateBookingCommandHandler.ts` attempts to do the exact same thing via CQRS. This duplication guarantees out-of-sync business rules.
*   **Event Architecture Failure:** `EventBus.ts` is an in-memory static singleton. In a Next.js Serverless environment (like Vercel), the process state is not shared between instances, and background processes are routinely paused or killed the moment an HTTP response is returned. Background listeners triggered by `EventBus` are highly likely to silently fail or cause memory leaks.

## 2. Dependency Graph

A dependency audit using `madge` reveals **Critical Circular Dependencies** that will cause unpredictable runtime initialization errors (e.g., `TypeError: Class is not a constructor`).

*   **Circular Import 1:** `entities/Booking.ts` -> `state/BookingStateMachine.ts` -> `entities/Booking.ts`
*   **Circular Import 2:** `entities/Booking.ts` -> `state/BookingStateMachine.ts` -> `events/BookingEvents.ts` -> `entities/Booking.ts`

**Other graph issues:**
*   `BookingDomainService` and `BookingService` are both utilized in parallel across the app.
*   `EventBus.ts` dynamically requires `./listeners` in a way that breaks modern tree-shaking and bundler analysis in Webpack/Turbopack.

## 3. Import / Export Audit

*   **Default Exports vs Named Exports:** The UI layer (`src/components/...`) heavily relies on `export default`. When combined with dynamic imports or barrel files (`index.ts`), this frequently leads to `Component is undefined` runtime crashes if re-exported incorrectly.
*   **Barrel File Hazards:** `src/domains/booking/index.ts` re-exports everything in the booking domain. Import loops are triggered because entities and state machines load the barrel file instead of direct file paths, leading to undefined constructors during the initial JS parse phase.

## 4. Domain Review

*   **Booking Domain:** Has rich entities (`Booking.ts`) but the orchestration is bypassed by `BookingService.ts`.
*   **Payment Domain:** `CreatePaymentOrderCommand` is instantiated directly inside the Booking Command Handler, coupling the two domains. The command handler also contains hardcoded business rules for pricing (`price = 1500; if (in_person) price = 2000`).
*   **Email Domain:** There is no real domain isolation. The API controller (`BookingController.ts`) manually awaits `sendEmailAction`.

## 5. State Machine Audit

*   **Side-effect Execution:** `BookingStateMachine.ts` changes the status and immediately calls `DomainEvents.dispatch`. Because this is synchronous, if the subsequent database save fails, the event has already been dispatched to listeners.
*   **Inconsistency:** The `PaymentStateMachine` uses `EventBus.publish`, while the `BookingStateMachine` uses its own `BookingEvents.dispatch`.
*   **Missing Entry/Exit Actions:** Validations exist for transitions, but actions (like releasing a locked slot when transitioning to `cancelled`) are not encapsulated in the state machine.
*   **Illegal Transitions Risk:** If `BookingService` directly mutates `booking.status` and saves it (which it does in some places), the State Machine is entirely bypassed.

## 6. Event Bus Audit

*   **Serverless Incompatibility (🔴 Critical):** Next.js App Router API routes execute in isolated serverless functions. An in-memory static `EventBus` will lose all state between cold starts. Furthermore, asynchronous listeners executed without `waitUntil()` will be forcefully terminated by the runtime when the HTTP response is sent.
*   **Error Propagation:** In `EventBus.publish`, if one listener throws an error, it is caught and logged via `console.error`, but it does not retry.
*   **Duplicate Listeners:** If `EventBus.ensureInitialized()` is called multiple times due to React fast-refresh or Next.js middleware, listeners will stack, causing extreme memory leaks and duplicated events.

## 7. Firestore Audit

*   **Document Structure:** `locked_slots` relies on a client-provided `expiresAt` check in some queries, leading to race conditions if the client and server clocks drift.
*   **Transaction Correctness:** `adminDb.runTransaction` is heavily used, but it spans across fetching Razorpay orders (a 3rd party network call!). Firestore transactions **must not** contain external API calls, as the transaction will retry automatically on contention, causing duplicate Razorpay orders.
*   **Write Amplification:** Creating a booking writes to `locked_slots`, `bookings`, and `bookings/{id}/audit_logs` all at once.

## 8. Repository Audit

*   **Transaction Coupling:** Passing `firebase-admin` Transaction objects deep into the Domain layer violates persistence ignorance.
*   **Concurrency Handling:** `FirestoreBookingRepository.lockSlot` checks `data.expiresAt.toDate() < new Date()`. This relies on the system time of the serverless function, which is acceptable, but it does not account for clock skew.
*   **Business Logic Leak:** The repository contains query logic (`findExpiredLocks`) that assumes business rules (e.g., status `awaiting_payment`).

## 9. Booking Engine Audit

*   **Double Booking Race Condition:** A network call to Razorpay is executed *before* the Firestore transaction locks the slot in `BookingService.ts`. If two requests hit the endpoint at the same time for the same slot, both will create a Razorpay order, but only one will succeed in Firestore. The loser will have generated an orphan Razorpay order.
*   **Slot Locking Expiry:** Locked slots are created, but there is no reliable background worker to clean them up. They rely on lazy deletion on next read.

## 10. Payment Engine Audit

*   **Hardcoded Pricing (🟠 High):** Pricing is hardcoded in the command handler.
*   **Duplicate Webhooks:** There is no idempotency guarantee observed for Razorpay webhooks. If Razorpay sends the same webhook twice, the `PaymentStateMachine` might throw a transition error, but it could also result in duplicated audit logs or emails.

## 11. Email Engine Audit

*   **Synchronous Execution (🔴 Critical):** `BookingController.ts` explicitly `await sendEmailAction(...)` during the HTTP request. This adds 1-3 seconds of latency to the booking endpoint.
*   **Provider Failures:** If Resend is down, the booking API request does not fail (which is good), but the event is logged as `EMAIL_FAILED` with no mechanism to retry. There is no Dead Letter Queue.

## 12. Timeline Audit

*   `AuditService` logs are written successfully, but the `BookingService` also directly writes to `audit_logs` collections, meaning the Timeline logic is fragmented.

## 13. Metrics Audit

*   Metrics depend entirely on the broken `EventBus` memory singleton. Metrics will be silently dropped in production.

## 14. Operations Platform Audit

*   No observability into the Event Bus.
*   No way to manually replay failed emails other than a potential manual API route that lacks proper UI context.

## 15. Security Audit

*   **RBAC Bypass:** Guest users are assigned a random ID (`guest_${crypto.randomUUID()}`). The Firestore Rules check `resource.data.userId == request.auth.uid`. A guest will never be able to access their own booking without a token, which is handled, but the rules are overly reliant on `request.auth.uid`.
*   **Injection:** `slotId` is generated using string concatenation: `${data.therapistId}_${data.date}_${data.time}`. Malicious inputs could alter the document path.
*   **Rate Limiting:** No API rate limiting is enforced on `/api/bookings/create`. This is highly vulnerable to brute-force slot-locking attacks.

## 16. Performance Audit

*   Synchronous 3rd-party network calls (Razorpay, Resend) are performed inside the HTTP request lifecycle and, disastrously, inside Firestore Transactions.
*   Dynamic `require` in `EventBus.ts` adds initialization overhead on cold starts.

## 17. Reliability Audit

*   **Partial Failures:** Because domain events are dispatched synchronously before the database transaction commits, a database failure will result in phantom events propagating through the system (e.g., sending an email for a booking that failed to save).

## 18. Scalability Audit

*   The architecture cannot scale horizontally due to the in-memory `EventBus`.
*   Contention on the `therapists` document or `locked_slots` will cause Firestore transaction aborts under load.

## 19. Testing Audit

*   Tests exist but mock the in-memory event bus. This provides a false sense of security, as the tests pass in Node.js but the system will fail in Vercel.

## 20. Code Quality Audit

*   **Duplication:** `BookingService` vs `CreateBookingCommandHandler`.
*   **God Objects:** `Booking` entity has 30+ fields and handles formatting.
*   **Magic Values:** Hardcoded '1500' and '2000' INR prices.

## 21. Logging Audit

*   `logger.withContext` is well-implemented and correlation IDs are present.
*   However, core system failures (like EventBus crashes) use standard `console.error` and lose the context/correlation ID.

## 22. Production Readiness

*   **Not Ready.** The system lacks a distributed queue (e.g., Google Cloud Tasks, Inngest, SQS) to replace the in-memory event bus.

## 23. Maintainability

*   The dual approach (Legacy Procedural Services vs CQRS Command Handlers) makes onboarding confusing. Refactoring is risky due to circular dependencies.

## 24. Architecture Score

*   Architecture: **3/10** (DDD is present in name, but violated in practice)
*   Maintainability: **4/10**
*   Scalability: **3/10** (Blocked by in-memory state)
*   Reliability: **2/10** (Serverless + In-Memory EventBus = Data Loss)
*   Performance: **5/10**
*   Security: **6/10**
*   Testing: **4/10**
*   Developer Experience: **5/10**
*   Production Readiness: **1/10**
*   Overall Engineering Quality: **3.5/10**

## 25. Critical Issues

### 🔴 CRITICAL
1.  **In-Memory Event Bus in Serverless:**
    *   *Why:* Next.js Serverless drops background tasks and doesn't share memory.
    *   *Failure:* Events (emails, metrics) will silently fail.
    *   *Fix:* Replace `EventBus` with Google Cloud Tasks, Inngest, or Upstash QStash.
    *   *Effort:* High.
2.  **3rd Party API Calls inside Firestore Transactions:**
    *   *Why:* Firestore transactions retry automatically on contention.
    *   *Failure:* Razorpay order generation inside a transaction will cause duplicate charges/orders on retry.
    *   *Fix:* Move Razorpay call OUTSIDE the `runTransaction` block.
    *   *Effort:* Medium.
3.  **Circular Dependencies in Domain:**
    *   *Why:* `Booking` -> `BookingStateMachine` -> `BookingEvents` -> `Booking`.
    *   *Failure:* Production builds may randomly fail or throw `is not a constructor`.
    *   *Fix:* Extract interfaces, avoid importing the entity directly into the event payload definition.
    *   *Effort:* Low.
4.  **Infrastructure Leak in Domain:**
    *   *Why:* Passing `Transaction` to domain services.
    *   *Failure:* Makes unit testing impossible without mocking Firebase; binds DDD to Firestore.
    *   *Fix:* Use an internal Unit of Work pattern or let the Application layer orchestrate the transaction and use standard Repository methods.
    *   *Effort:* Medium.

### 🟠 HIGH
1.  **Split-Brain Booking Logic:**
    *   *Why:* `BookingService.ts` and `CreateBookingCommandHandler.ts` do the same thing.
    *   *Fix:* Delete `BookingService.ts` completely and standardize on CQRS handlers.
2.  **Hardcoded Pricing:**
    *   *Why:* Prices are hardcoded in application logic.
    *   *Fix:* Fetch pricing from a database configuration or Therapist document.

### 🟡 MEDIUM
1.  **Synchronous Email Sending in API Route:**
    *   *Why:* Adds high latency.
    *   *Fix:* Publish a `BookingCreated` event to a persistent queue, and let a worker send the email.

## 26. Refactoring Roadmap

**Must Fix Before Production:**
1.  Remove 3rd party calls (Razorpay) from inside Firestore transactions.
2.  Resolve the circular imports in the booking domain.
3.  Replace `EventBus.ts` with a durable background job processor compatible with Next.js (e.g., Inngest).

**Should Fix Soon:**
1.  Consolidate `BookingService.ts` logic into the CQRS Command Handlers and delete the legacy service.
2.  Remove `Transaction` imports from Domain Services.
3.  Extract hardcoded pricing into environment variables or database configurations.

**Technical Debt:**
1.  Fix Barrel file (`index.ts`) import patterns to strictly avoid circular resolution.
2.  Standardize state machine event dispatching across Booking and Payment domains.

## 27. Final Verdict

**Would I approve this platform for production?**

**NO. ABSOLUTELY NOT.**

**Blockers:**
1.  The in-memory event bus guarantees data loss (dropped emails, dropped timelines, dropped analytics) in a serverless environment.
2.  Calling Razorpay *inside* a Firestore transaction guarantees duplicate payment orders when database contention forces a transaction retry.
3.  The circular dependencies are a ticking time bomb for the Vercel build pipeline and runtime initialization.

This codebase looks like a transition project that stopped halfway between Procedural Scripting and Domain-Driven Design. It has the *vocabulary* of a robust system (Events, Commands, State Machines) but lacks the actual structural discipline required to make them work reliably at scale.

Fix the 3 blockers, and it will survive contact with real users.
