# Saarthi - Complete Technical Audit & Production Readiness Review

## 1. PRODUCT ARCHITECTURE REVIEW
**Score: 6.5/10**

**Issues & Risks:**
- **Inconsistent Backend Boundaries:** The codebase mixes server-side Next.js App Router features (like `src/app/api/`) with heavy client-side Firebase logic. `src/services/bookingService.ts` executes complex Firestore transactions on the client side, while other operations are routed through API routes (e.g. `/api/email`, `/api/payment`). This split architecture is confusing and poses scalability and security risks. Client-side transactions are brittle, easily manipulated, and subject to client connection drops.
- **Service Layer Coupling:** The `bookingService` does too much. It handles Firestore transactions, calls out to API routes for payments, deals with emails, and contains raw logic for formatting.
- **Component Complexity:** The `TherapistDashboard.tsx` is bloated (~30k chars), handling UI, status updates, modal states, and formatting. This is a spaghetti architecture risk. Components should be strictly presentational or delegate logic to custom hooks, which are currently under-utilized.
- **Redundant State Flow:** `useBooking.ts` handles form submissions, but it directly interacts with `bookingService.ts` which performs client-side Firestore writes. The correct Next.js architecture would involve Server Actions or API routes for data mutations.

**Fix:** Move all critical business logic (booking creation, transaction locking, slot manipulation, status changes) to Next.js API Routes or Server Actions, powered by the Firebase Admin SDK. Break down large components like dashboards into smaller, focused modules.

## 2. FIREBASE + FIRESTORE AUDIT
**Score: 5/10**

**Issues & Risks:**
- **Unsafe Client Transactions:** Transactions for booking logic (e.g. `rescheduleBooking`, `updateBookingStatus`, `lockSlot`) run on the client (`runTransaction(db, ...)`). If the client disconnects or manipulates the network requests, data corruption or race conditions can occur.
- **Flawed Slot Locking Mechanism:**
    - The `lockSlot` implementation checks expiration by reading `expiresAt`. If `expiresAt` is in the past, it manually issues a `transaction.delete(slotRef)`. This requires an *active* client to clean up stale locks. If no client touches the stale lock, it just sits there.
    - Security risk: A malicious user can write to `locked_slots` (via the insecure rules) with no `expiresAt` or with a spoofed `therapistId` to block out all of a therapist's availability permanently (Denial of Service).
- **Over-fetching & Query Inefficiencies:** Listeners and queries are not fully optimized. Without server-side execution, a user on a slow network downloading large booking chunks will experience severe latency.
- **Optimistic UI Weakness:** The application mixes some optimistic state with heavy asynchronous updates, leading to jarring UI shifts on slow networks.

**Fix:** Use Firebase Cloud Functions or Next.js API routes with Firebase Admin to handle all booking logic and locking. Implement a TTL (Time-To-Live) index on `locked_slots` so Firestore automatically deletes expired locks, removing the need for manual cleanup checks in the code.

## 3. FIRESTORE SECURITY RULES REVIEW
**Score: 3/10 (CRITICAL RISK)**

**Issues & Risks:**
- **Exploitable Booking Creation:** The rule for `create` on `/bookings/{bookingId}` allows *any* user (even unauthenticated) to write a booking. While there is validation checking for types and size constraints, there is **no validation** on what other fields can be injected. A malicious user can add `role: "admin"` or `price: 0` to the document.
- **Dangerous Slot Locking Rule:** `/locked_slots/{slotId}` allows `create: if request.resource.data.keys().hasAll(...)`.
    - It allows unauthenticated users to lock a slot.
    - It allows an attacker to specify an arbitrary `therapistId` and lock it forever by omitting `expiresAt` (since `(!('expiresAt' in request.resource.data) || request.resource.data.expiresAt is timestamp)` allows it).
- **Privilege Escalation via Users Collection:** The `isAdmin()` function relies on `role == 'admin'` in the `users` collection. If an attacker finds a way to write to their user doc, they become admin. The `write: if isAdmin()` rule on the `users` collection prevents immediate escalation, but there's a comment `// Only admins can write, or a strict bootstrap rule...` — if a developer creates a backdoor during testing, the whole system is compromised.
- **Insecure Contacts Creation:** `allow create: if true` on `/contacts/{contactId}` allows unauthenticated users to spam the database, driving up Firestore costs (Billing Attack).

**Fix:**
- Restrict `bookings` and `locked_slots` writes entirely and move them to an API Route/Server Action using Admin SDK.
- If they must remain on the client, use strict schema validation in the rules (e.g., `request.resource.data.keys().hasOnly([...])`).
- Add rate limiting (which is impossible purely in rules; requires an API or Cloud Function).

## 4. AUTHENTICATION + SESSION REVIEW
**Score: 7/10**

**Issues & Risks:**
- **Race Condition in `AuthContext`:** The `AuthContext` manually syncs Firebase Client Auth with a backend cookie (`/api/auth/session/route.ts`). If the backend cookie POST fails, the UI still shows the user as logged in via Firebase Client State, but Middleware will block them. This split brain can result in infinite redirect loops.
- **Middleware Gaps:** The Next.js middleware currently relies on checking if a `__session` cookie exists, but it **does not verify** the validity or role of the cookie. A user could have a client session cookie but try to access `/admin`. Since the middleware only checks for the existence of `__session`, it passes them through. The page then throws an error or shows empty states.
- **Insecure Token Handling:** The `/api/auth/session` endpoint creates a 5-day session cookie but doesn't check for token revocation.

**Fix:** The Middleware must crack open the JWT session cookie or hit a fast-edge DB to verify the *role* before allowing access to `/admin` or `/therapist` routes. Handle the token sync failure in `AuthContext` securely (force logout if the API fails).

## 5. BOOKING SYSTEM REVIEW
**Score: 4/10**

**Issues & Risks:**
- **Concurrency & Double Booking:** In `BookingSystem.tsx`, `lockSlot` is called, and then there is a UI delay before `createBooking` is called. If the user closes the browser during this delay, the slot remains locked until it expires.
- **Stale State Risks:** `bookingService.ts` contains `rescheduleBooking` logic that tries to read and write to locks in the same client-side transaction. If two users try to grab the same rescheduled slot, one will fail with an ugly raw error.
- **Timezone Ignorance:** All dates and times are treated as simple strings (`"YYYY-MM-DD"`, `"10:00 AM"`). If a therapist is in EST and the client is in PST, the booking will be entirely desynchronized. This is a massive issue for online therapy.

**Fix:** Standardize everything to UTC ISO-8601 strings in the database. Convert to the local timezone only on the UI layer. Move all booking transactions to a server environment.

## 6. DASHBOARD SYSTEM REVIEW
**Score: 6/10**

**Issues & Risks:**
- **Over-fetching & Memory Leaks:** The dashboards load all bookings without pagination. A therapist with 500 past bookings will download the entire history every time the dashboard mounts.
- **Lack of Realtime Sync:** Therapists have to manually refresh or wait for full re-renders to see new booking requests. Given this is Firebase, realtime listeners should be used for the `pending` bookings queue so therapists are notified instantly.
- **Logic Duplication:** Both `AdminDashboard` (assumed) and `TherapistDashboard` likely duplicate the logic for parsing, sorting, and filtering bookings.

**Fix:** Implement cursor-based pagination for past bookings. Add a realtime `onSnapshot` listener for bookings where `status == 'pending'`.

## 7. UI/UX REVIEW
**Score: 8/10**

**Positives:** Framer Motion is well integrated. `BookingSystem.tsx` step-by-step UI is engaging.
**Issues & Risks:**
- **Error Handling UX:** Raw error strings from Firestore (e.g., "This slot is already booked.") are thrown to the user via Sonner toasts. These should be parsed into user-friendly messages.
- **Loading States:** In `TherapistDashboard`, the loading state replaces the entire UI, causing a layout shift. Skeleton loaders should be used instead.
- **Navigation:** The mobile menu implementation in `Navbar.tsx` is functional but the button spacing on mobile can cause accidental clicks.

**Fix:** Implement Skeleton loaders for dashboards. Intercept backend errors and map them to friendly UI copy.

## 8. ACCESSIBILITY AUDIT
**Score: 6/10**

**Issues & Risks:**
- **Focus Management:** Modals (like `RescheduleModal.tsx` and `SessionDetailsModal.tsx`) likely lack proper focus trapping. When a modal opens, keyboard users can still tab to the background elements.
- **ARIA Labels:** Buttons in `BookingSystem.tsx` steps lack `aria-label` or `aria-expanded` attributes, making screen readers struggle with the dynamic multi-step form.
- **Contrast Ratios:** Without verifying the exact Tailwind hex codes, the "muted" text on some backgrounds might fail WCAG AA contrast standards.

**Fix:** Integrate Radix UI Primitives (which Shadcn provides) correctly for all modals and dropdowns to ensure focus trapping. Run Lighthouse Accessibility checks.

## 9. PERFORMANCE REVIEW
**Score: 7/10**

**Issues & Risks:**
- **Bundle Size:** Importing the entirety of `framer-motion` and large icons dynamically can bloat the initial JS payload.
- **Wasted Renders:** `BookingSystem.tsx` holds a large `bookingData` state object. Typing into the details step causes the entire multi-step wrapper to re-render on every keystroke.

**Fix:** Use `react-hook-form` to isolate form state from the main component rendering cycle. Lazy load heavy components and Modals (`next/dynamic`).

## 10. COMPONENT SYSTEM REVIEW
**Score: 8/10**

**Issues & Risks:**
- **Prop Drilling:** The booking flow passes too many props down to the steps (e.g., `onSelect`, `onBack`, `data`). A dedicated Context for the booking flow would clean this up.
- **UI Consistency:** `Button.tsx` is well constructed with `cva`, but custom variants like `accent` hardcode colors (`bg-[#E6A520]`) instead of using CSS variables, breaking theme consistency if a dark mode is introduced.

**Fix:** Update `Button.tsx` to use `bg-accent` and define the hex in `globals.css`. Implement a `BookingContext`.

## 11. CODE QUALITY REVIEW
**Score: 6.5/10**

**Issues & Risks:**
- **Typing Safety:** There is heavy usage of `any` in `useBooking.ts` (`err: any`, `bookingData: any`) and in the `cleanPayload` function. This defeats the purpose of TypeScript.
- **Brittle Formatting:** The `cleanPayload` function in `bookingService.ts` is a hacky workaround to strip `undefined` fields for Firestore. This should be handled by a Zod schema validation step prior to any DB interaction.
- **Error Silencing:** `resendService.ts` catches errors and has a comment `// Suppress throwing to not block the UI`. This is dangerous; if emails fail to send (e.g. Booking Confirmed), the therapist thinks the user knows, but they don't. It fails silently.

**Fix:** Replace `any` with strong Zod schemas and infer types. Do not suppress critical email errors; instead, log them to Sentry/Datadog and potentially queue them for retry.

## 12. MOBILE EXPERIENCE REVIEW
**Score: 7/10**

**Issues & Risks:**
- **Responsive Layouts:** The step indicators in the booking flow can become cramped or overflow on very small devices (like iPhone SE).
- **Data Tables:** Dashboards on mobile often fail because tables are not wrapped in `overflow-x-auto`.

**Fix:** Use stacked cards instead of tables for mobile dashboards. Adjust the step indicator to show only "Step 2 of 6" on mobile instead of all numbers.

## 13. MISSING FEATURES REVIEW
- **Timezone Handling:** CRITICAL missing feature. Needs `date-fns-tz` or similar to manage across-timezone bookings.
- **Rate Limiting:** Missing entirely. An attacker can write 10,000 pending bookings.
- **Firestore Indexes:** Not explicitly defined in the repo context, but sorting bookings by date and status requires composite indexes which are likely missing, causing queries to fail at scale.
- **Audit Logging for Security:** Audit logs exist, but they are stored in the same client-accessible collection.

## 14. FINAL PRODUCTION READINESS SCORE

- Architecture Score: 6.5/10
- Security Score: 3/10
- UX Score: 8/10
- Scalability Score: 5/10
- Accessibility Score: 6/10
- **Overall Production Readiness Score: 5.7/10 (NOT READY)**

### 1. Critical Issues (Must Fix Before Launch)
- **Migrate Firestore Booking Transactions to Backend:** Client-side transactions for slot locking and booking are completely insecure and easily bypassed. Use Firebase Admin in a Next.js Server Action or API Route.
- **Fix Security Rules:** Remove `allow create: if true` on `/bookings` and `/locked_slots` or lock them down exclusively to specific schema constraints and prevent data injection (like role escalation).
- **Timezone Normalization:** Add timezone support to all booking functions, saving UTC dates and converting locally.

### 2. High Priority Improvements
- **Middleware Role Authorization:** Ensure `middleware.ts` decodes the token and checks roles, preventing split-brain session states.
- **Implement Rate Limiting:** Add Upstash Redis or similar to prevent API and database abuse.
- **Handle Email Failures:** Stop swallowing errors in `resendService`. Implement a retry mechanism or alert system.

### 3. Medium Improvements
- **Refactor Booking State:** Use `react-hook-form` and a context provider to manage the multi-step booking form.
- **Add Pagination/Realtime:** Use `onSnapshot` for pending requests and pagination for past requests in dashboards.

### 4. Nice-to-have Improvements
- **Dark Mode Support:** Clean up hardcoded hex values in UI components.
- **Lazy Loading:** Dynamically import heavy UI libraries to improve initial load speed.
