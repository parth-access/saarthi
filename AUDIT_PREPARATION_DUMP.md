# Saarthi - Architecture + Code Audit Preparation Dump

## 1. FULL REPO STRUCTURE

```
src/
├── app/                  # Next.js App Router root
│   ├── (auth)/           # Route group for auth
│   │   └── login/
│   ├── (public)/         # Route group for public pages
│   │   ├── about/
│   │   ├── book/
│   │   ├── contact/
│   │   ├── therapists/
│   │   └── vision/
│   ├── (secure)/         # Route group for client protected routes
│   │   ├── manage-booking/
│   │   └── payment/
│   ├── admin/            # Admin dashboard routes
│   ├── api/              # API Routes (Backend boundaries)
│   │   ├── auth/session/
│   │   ├── availability/
│   │   ├── contact/
│   │   ├── email/
│   │   ├── health/
│   │   ├── manage-booking/
│   │   ├── payment/
│   │   ├── reconnect/
│   │   └── reschedule/
│   ├── dashboard/        # Client dashboard routes
│   └── therapist/        # Therapist dashboard routes
├── components/           # React Components
│   ├── admin/
│   ├── auth/
│   ├── booking/          # Multi-step booking UI
│   ├── dashboard/        # Dashboard layout/modals
│   ├── forms/
│   ├── home/
│   ├── layout/
│   ├── therapist/
│   └── ui/               # shadcn/ui primitives
├── contexts/             # Global Contexts (AuthContext)
├── hooks/                # Custom React Hooks
├── lib/                  # Utilities & Core Libs
│   └── firebase/         # Firebase initialization
│       ├── admin.ts      # Server-side Firebase
│       └── client.ts     # Client-side Firebase
├── screens/              # LEGACY Vite Screens (Needs migration)
├── services/             # Core Business Logic / Data Layer
│   ├── authService.ts
│   ├── bookingService.ts
│   ├── resendService.ts
│   └── therapistService.ts
├── types.ts              # Global TypeScript Definitions
└── utils/                # Helper functions (logging, mappers)
```

## 2. PACKAGE + STACK INFO

- **Framework:** Next.js 15.1.0 (App Router)
- **Runtime:** Node.js (V8)
- **UI Library:** React 19.0.0
- **Styling:** TailwindCSS 4.0.0-beta.8
- **Animation:** Motion (Framer Motion)
- **Firebase Client SDK:** 11.10.0
- **Firebase Admin SDK:** 13.9.0
- **Deployment Target:** Vercel (implied by `vercel.json` and standard Next.js paths)
- **Auth Provider:** Firebase Authentication (Email/Password & Google OAuth)
- **Database:** Cloud Firestore
- **Forms/Validation:** React Hook Form + Zod
- **Payments:** Razorpay
- **Emails:** Resend + Nodemailer

## 3. FIREBASE ARCHITECTURE

- **Collections:**
  - `users`: Keyed by `auth.uid`. Stores `role` (admin, therapist, client).
  - `therapists`: Keyed by `therapistId`. Contains `authId` linking to a user.
  - `therapistAvailability`: Parent document for availability rules.
    - *Nested:* `/recurringRules/{ruleId}`
    - *Nested:* `/overrides/{overrideId}`
  - `bookings`: Central booking ledger.
    - *Nested:* `/audit_logs/{auditId}`
  - `locked_slots`: Temporary documents tracking concurrent slot locks.
  - `contacts`: Lead generation / contact forms.
- **Security Rules:** Recently audited and rewritten using `hasOnlyKeys` for strict NoSQL injection prevention. Client-side locks are bounded by a 15-minute `expiresAt` window. Users collection is locked to admin writes only.
- **Indexes:** Requires composite indexes for `bookings` (therapistId + date + status) and a TTL index on `locked_slots`.
- **Firebase Admin:** Initialized in `src/lib/firebase/admin.ts`. Uses `FIREBASE_ADMIN_KEY_BASE64`.
- **Firebase Client:** Initialized in `src/lib/firebase/client.ts`. Uses `NEXT_PUBLIC_FIREBASE_*`.

## 4. AUTH FLOW

1. **Signup/Login Initiation:**
   - User signs in via `src/app/(auth)/login/page.tsx` using Google or Email.
   - `authService.loginWithGoogle` or `authService.login` interacts with Firebase Auth.
   - For Google, it creates a `users` document with `role: 'client'` if one doesn't exist.
2. **Session Persistence (JWT & Cookies):**
   - Firebase Auth state change fires in `src/contexts/AuthContext.tsx`.
   - The client fetches the user's role from the `users` collection.
   - The client extracts the Firebase ID Token (`user.getIdToken()`).
   - The client makes a `POST` request to `/api/auth/session` with the `idToken`.
   - The Next.js API route uses Firebase Admin to verify the token and mints a 5-day session cookie named `__session`.
3. **Middleware Validation:**
   - `src/middleware.ts` intercepts requests to `/admin`, `/therapist`, and `/dashboard`.
   - It checks for the existence of the `__session` cookie. If missing, it redirects to `/login`.
   - **Flaw:** It does *not* verify the JWT signature or the specific role of the user.

## 5. BOOKING FLOW

1. **Frontend Selection:** User navigates the multi-step `BookingSystem.tsx` (Therapist → Session Type → Date → Slot → Details).
2. **Slot Locking:** User selects a time slot. `useBooking.ts` calls `bookingService.lockSlot`. This performs a *client-side* Firestore transaction to create a document in `locked_slots` to reserve the time temporarily.
3. **Submission:** User fills details and clicks "Confirm". `bookingService.createBooking` runs a client-side transaction to verify the slot is still locked by the user, creates the `bookings` document, and deletes the temporary lock ID from the slot document, making it a permanent lock.
4. **Notification:** The `resendService` is called to dispatch a "booking-received" email.
5. **Therapist Dashboard:** The therapist sees the booking via a client-side fetch.
6. **Payment Phase (Awaiting Payment):** If the therapist confirms, status updates to `awaiting_payment`. The user gets an email, pays via Razorpay, and the webhook updates status to `confirmed`.

## 6. CURRENT KNOWN ISSUES

- **TODOs/FIXMEs/Hacks:**
  - `cleanPayload` in `bookingService.ts` is a hack to strip `undefined` fields for Firestore.
  - Type casting heavily relies on `any` in `try/catch` blocks (`catch (err: any)` across services).
  - Background slot cleanup in `/api/availability/route.ts` runs without await (`Promise.all(...).catch(...)`), which might be killed by Vercel before completing.
- **Unsafe Firestore Writes:**
  - `bookingService.ts` executes complex, multi-document transactions directly from the client.
- **Direct Client DB Writes:**
  - Bookings, locked slots, and status updates are written directly from the browser instead of via an API route.

## 7. API ARCHITECTURE

- `/api/auth/session`: Handles POST (mint cookie) and DELETE (destroy cookie).
- `/api/availability`: GET route. Uses Firebase Admin to fetch locked and booked slots to calculate available UI slots.
- `/api/contact`: POST route. Saves contact forms (bypassing the insecure client).
- `/api/email`: POST route. Wrapper for Resend.
- `/api/payment/create-order`: Razorpay order generation.
- `/api/payment/webhook`: Razorpay verification.
- **Validation:** Lacks strong input validation (like Zod) on most endpoints. Relies heavily on checking if variables are truthy.
- **Auth Middleware Usage:** Lacks token signature verification in Next.js middleware.
- **Response Standardization:** Mixes `{ success: true }` and `{ error: "msg" }`.

## 8. PERFORMANCE RISKS

- **Client-Heavy Components:** `TherapistDashboard.tsx` is over 30k characters, handling UI, state, modals, filtering, and data formatting in one massive client block.
- **Overfetching:** Bookings are fetched in full without pagination.
- **"use client" Abuse:** Every route in the `src/app` directory forces client-side rendering, negating RSC benefits and bloating initial JS loads.
- **Realtime Listener Leaks:** If realtime listeners are used in the dashboard, there's no visible cleanup in the component unmount cycle.

## 9. SECURITY RISKS

- **Admin SDK Misuse:** None detected in client files. `server-only` is correctly imported in `admin.ts`.
- **Insecure Rules:** Recently patched, but relies on a strict schema match.
- **Trusting Frontend IDs:** `bookingService.ts` allows the frontend to specify the `lockId` during booking creation.
- **Middleware Bypass:** Forging a cookie named `__session` bypasses edge protection.

## 10. TIMEZONE + DATE HANDLING

- **Assumptions:** Times are handled via naive string manipulation (`const [startH, startM] = startTime.split(':').map(Number)`).
- **Slot Generation:** `useAvailability.ts` generates times based on local browser time logic without utilizing UTC or specific timezone offsets. This will cause major desyncs if a therapist and client are in different time zones.

## 11. DASHBOARD ARCHITECTURE

- **Therapist Dashboard:** Client-side rendered. Fetches data, filters based on `status`, manages large `SessionDetailsModal` and `RescheduleModal` components inline. Lacks proper pagination.
- **Data Fetching:** Relies on manual fetches or basic React state arrays rather than a robust caching library like `SWR` or `React Query`.

## 12. CRITICAL FILES

### src/middleware.ts
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const session = request.cookies.get('__session')?.value;
  const { pathname } = request.nextUrl;
  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/therapist') || pathname.startsWith('/dashboard');
  const isAuthPath = pathname.startsWith('/login');

  if (isProtectedPath && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (isAuthPath && session) {
    return NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/therapist/:path*', '/dashboard/:path*', '/login'],
};
```

### src/lib/firebase/admin.ts
```typescript
import 'server-only';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const base64 = process.env.FIREBASE_ADMIN_KEY_BASE64;
    if (!base64) throw new Error('FIREBASE_ADMIN_KEY_BASE64 is missing');
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(decoded);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized');
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
  }
}

export const adminDb = admin.apps.length ? admin.firestore() : null as unknown as admin.firestore.Firestore;
export const adminAuth = admin.apps.length ? admin.auth() : null as unknown as admin.auth.Auth;
```

### src/lib/firebase/client.ts
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, getDoc, setDoc, updateDoc, addDoc, serverTimestamp, query, orderBy, where, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID
};

const checkEnv = () => !!firebaseConfig.apiKey && !!firebaseConfig.authDomain && !!firebaseConfig.projectId;
const firebaseEnabled = checkEnv();
let app = null;
let authInstance: any = null;
let dbInstance: any = null;

if (firebaseEnabled) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
  }
}

export const auth = authInstance;
export const db = dbInstance;
export const isFirebaseEnabled = firebaseEnabled && !!app && !!authInstance;
```

### src/app/api/availability/route.ts
```typescript
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const therapistId = searchParams.get('therapistId');
    const date = searchParams.get('date');

    if (!therapistId || !date) return NextResponse.json({ error: 'therapistId and date are required' }, { status: 400 });

    const bookingsPromise = adminDb
      .collection('bookings')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .where('status', 'in', ['pending', 'pending_approval', 'awaiting_payment', 'confirmed'])
      .get();

    const lockedSlotsPromise = adminDb
      .collection('locked_slots')
      .where('therapistId', '==', therapistId)
      .where('date', '==', date)
      .get();

    const [bookingsSnapshot, lockedSlotsSnapshot] = await Promise.all([bookingsPromise, lockedSlotsPromise]);
    const bookedTimes = bookingsSnapshot.docs.map((doc) => doc.data().time);
    const lockedTimes: string[] = [];
    const locksToDelete: string[] = [];

    lockedSlotsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      let isExpired = false;
      if (data?.expiresAt && typeof data.expiresAt.toDate === 'function' && data.expiresAt.toDate() < new Date()) isExpired = true;
      else if (data?.expiresAt && typeof data.expiresAt.toMillis === 'function' && data.expiresAt.toMillis() < Date.now()) isExpired = true;
      else if (data?.expiresAt && typeof data.expiresAt === 'number' && data.expiresAt < Date.now()) isExpired = true;

      if (isExpired) locksToDelete.push(doc.id);
      else lockedTimes.push(data.time);
    });

    if (locksToDelete.length > 0) {
      Promise.all(locksToDelete.map(id => adminDb.collection('locked_slots').doc(id).delete())).catch(err => {
         console.error("Failed background cleanup of locked_slots", err);
      });
    }

    return NextResponse.json({ bookedTimes, lockedTimes });
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

## 13. FINAL ENGINEERING AUDIT

- **Current Maturity Score:** 4.5/10
- **Production Readiness:** **NOT READY.** Do not launch.
- **Scalability Risks:**
  - Client-side execution of complex transactions will fail under load or poor network conditions.
  - Native timezone ignoring will cause cross-country booking collisions.
  - Unpaginated dashboards will crash the browser for active therapists.
- **Architectural Debt:**
  - Migrated to Next.js App Router but retained SPA architecture. The heavy usage of `"use client"` entirely bypasses Next.js's primary performance features (RSC, SSR).
  - Legacy `src/screens/` folder remains and overlaps with `src/app/`.
- **Immediate Fixes:**
  1. Move all booking transactions (`bookingService.createBooking`, `lockSlot`) strictly to Next.js API Routes using Firebase Admin.
  2. Implement an Edge-compatible JWT verifier in `middleware.ts`.
  3. Adopt `date-fns-tz` to enforce UTC storage and local-time display.
  4. Purge `react-router-dom`, `VITE_` variables, and the `src/screens` folder entirely.
- **Recommended Next Milestones:**
  - **Milestone 1:** Secure the Server Boundary (API routes for mutations, Middleware JWT verification).
  - **Milestone 2:** React Server Components (Remove root level `"use client"`, fetch initial dashboard data on the server).
  - **Milestone 3:** Internationalization / Timezones (Standardize date handling).