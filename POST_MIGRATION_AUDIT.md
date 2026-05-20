# Next.js App Router Post-Migration Audit
**Status:** Post-Migration Phase

## Overview
A review of the repository state *after* the Next.js consolidation commit. While progress has been made to establish the Next.js foundation, several critical transitional artifacts remain that compromise the architecture, runtime stability, and security of the application.

This audit focuses exclusively on the *current* state of the repository, distinguishing between acceptable transitional scaffolding and genuine production risks.

---

## 🔴 CRITICAL FINDINGS (Runtime & Architectural Failures)

### 1. `react-router-dom` Leftovers in Production Bundle
**Finding:** `react-router-dom` is still defined in `package.json` and actively imported via `<BrowserRouter>` in `src/App.tsx`.
**Risk:** App Router enforces file-system routing. Initializing a `BrowserRouter` inside a Next.js App Router context causes severe hydration errors, memory leaks, and routing conflicts. The client runtime will attempt to handle paths simultaneously with the Next.js edge router.
**Classification:** Genuine Flaw. This is not an acceptable transitional state for a completed consolidation.

### 2. App Router Rendering Violations (`"use client"` Abuse)
**Finding:** Every routing file in `src/app/` (including `layout.tsx`, `page.tsx`, and all nested routes) starts with `"use client";`.
**Risk:** This completely bypasses React Server Components (RSC) and Next.js SSR. It forces the Next.js infrastructure to render entirely on the client side, sending massive JavaScript payloads to the user. This breaks Next.js metadata injection (SEO) and defeats the primary architectural benefit of migrating to the App Router.
**Classification:** Genuine Flaw / Anti-Pattern.

### 3. Firebase Initialization Fragility
**Finding:** `next.config.ts` maintains a shim mapping `VITE_FIREBASE_*` to `NEXT_PUBLIC_FIREBASE_*`, and `src/lib/firebase/client.ts` falls back to `VITE_` variables.
**Risk:** Next.js strips `VITE_` variables from the client bundle. Relying on `next.config.ts` to alias `env` vars is highly brittle and can fail during Static Site Generation (SSG) or middleware execution. If the underlying `.env` file still relies on `VITE_`, client-side Firebase initialization will fail silently in production.
**Classification:** Genuine Flaw. The `VITE_` prefix must be completely purged from the repository.

---

## 🟠 HIGH FINDINGS (Security & Middleware Risks)

### 1. Middleware Security Gap
**Finding:** `src/middleware.ts` checks for the existence of `__session` but does not decode or verify the JWT.
**Risk:** An attacker can forge a dummy `__session` cookie and bypass the middleware entirely to access `/admin` or `/therapist`. While the client-side Firebase Auth context might eventually catch this and boot them, this causes layout thrashing and exposes protected API routes if they share the same middleware protection scheme.
**Classification:** Genuine Flaw / Security Regression. The middleware must use a lightweight library (like `jose`) to verify the token signature on the Edge runtime.

### 2. React Helmet Async Retention
**Finding:** `react-helmet-async` is still present in `package.json`.
**Risk:** Using Helmet in a Next.js App Router application conflicts directly with the Next.js `Metadata` API. This results in duplicate `<head>` tags, unpredictable SEO behavior, and hydration mismatches.
**Classification:** Genuine Flaw.

---

## 🟡 MEDIUM FINDINGS (Cleanup & Dependencies)

### 1. Legacy `src/screens` Directory Remains
**Finding:** The `src/screens/` directory (containing ~16 component files) has not been removed or fully refactored.
**Risk:** If any of the new `src/app/` routes are importing directly from `src/screens/`, they carry over legacy Vite assumptions. This is an acceptable transitional architecture *only* if these screens are actively being refactored into Next.js components, but they pose a high risk of containing legacy `react-router-dom` hooks (`useNavigate`).
**Classification:** Acceptable Transitional Architecture (but requires immediate cleanup).

### 2. Extraneous Vite Dependencies
**Finding:** `vite-plugin-compression` is still in `package.json`.
**Risk:** Dead dependency bloating the lockfile and confusing developers. Next.js handles compression natively.
**Classification:** Dependency Cleanup Mistake.

---

## 🟢 LOW FINDINGS (Code Smells & Configurations)

### 1. TypeScript Strictness Disabled
**Finding:** `next.config.ts` has `typescript: { ignoreBuildErrors: true }`.
**Risk:** While acceptable during a messy migration, leaving this enabled in a "completed" consolidation phase hides newly introduced bugs and incorrect module imports.
**Classification:** Acceptable Transitional Architecture (High priority for removal).

---

## 🛠️ AUDITOR RECOMMENDATIONS

1. **Purge Legacy Routing:** Uninstall `react-router-dom` and `react-helmet-async`. Delete `src/App.tsx`. Update all legacy `Link` or `useNavigate` calls to use `next/link` and `next/navigation`.
2. **Restore Server Components:** Remove `"use client"` from `src/app/layout.tsx` and all top-level page components unless they strictly require client-side interactivity (like `useState` or `useEffect`). Use the Next.js `metadata` export for SEO.
3. **Standardize Environment Variables:** Remove the `env` block from `next.config.ts`. Ensure all `.env` files use the `NEXT_PUBLIC_` prefix, and update `src/lib/firebase/client.ts` to remove the `|| process.env.VITE_*` fallback.
4. **Secure the Edge:** Implement token verification in `middleware.ts` using an edge-compatible JWT verifier to prevent trivial routing bypasses.
