# Next.js App Router Migration Audit
**Status:** In Progress (Hybrid/Transitional Phase)

## Overview
The migration from Vite + React Router to Next.js App Router is underway. While the repository now compiles via `next build`, it currently exists in a fragile transitional state. There are severe architectural collisions between the legacy SPA paradigm and the new Next.js App Router paradigm.

---

## 🔴 CRITICAL FINDINGS (Breakage Risks & Server Violations)

### 1. `react-router-dom` in Next.js App Router
**Finding:** `package.json` retains `react-router-dom`, and `src/App.tsx` imports `<BrowserRouter>`.
**Risk:** App Router handles all routing via the file system (`src/app/`). Utilizing `react-router-dom` inside a Next.js App Router project causes catastrophic hydration mismatches and completely breaks Next.js server-side routing, layout propagation, and metadata generation.
**Classification:** Genuine Flaw. This is not a safe transitional state; `App.tsx` must be deprecated immediately in favor of `src/app/layout.tsx` and `src/app/page.tsx`.

### 2. Client Boundary Violations (`"use client"` Abuse)
**Finding:** EVERY SINGLE route in the `src/app/` directory (e.g., `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/admin/page.tsx`, `src/app/not-found.tsx`) begins with `"use client";`.
**Risk:** By marking the root layout and all pages as `"use client"`, you completely disable React Server Components (RSC) and Server-Side Rendering (SSR) for initial data loads. This forces the Next.js app to behave exactly like the old Vite SPA, resulting in massive JavaScript bundle sizes being sent to the client. Furthermore, placing `"use client"` in `layout.tsx` prevents Next.js from injecting server-side `<head>` metadata correctly.
**Classification:** Genuine Flaw / Next.js Anti-pattern.

### 3. Mixed Environment Variable Logic
**Finding:** `src/lib/firebase/client.ts` uses fallback logic: `process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY`.
**Risk:** Next.js explicitly strips `process.env.VITE_*` from the client bundle for security. If `.env` is not fully migrated to `NEXT_PUBLIC_`, Firebase initialization will silently fail in production on the client side. `next.config.ts` attempts a hacky shim (`NEXT_PUBLIC_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY`), which is highly fragile and breaks static site generation (SSG) assumptions.
**Classification:** Transitional Architecture (High Risk).

---

## 🟠 HIGH FINDINGS (Architectural & Runtime Incompatibilities)

### 1. Legacy `src/screens` Directory Retention
**Finding:** The entire `src/screens/` folder remains intact (e.g., `Dashboard.tsx`, `Login.tsx`, `Therapists.tsx`).
**Risk:** These screens were designed for React Router. As they are slowly imported into the `src/app` routes, any residual usage of `useNavigate`, `useParams`, or `useLocation` from `react-router-dom` will crash the Next.js runtime.
**Classification:** Transitional Architecture. These components must be mapped to Next.js `next/navigation` hooks (`useRouter`, `usePathname`).

### 2. Unsafe Firebase Admin Edge Constraints
**Finding:** `middleware.ts` currently performs simple cookie existence checks but doesn't verify the JWT. If logic is added to verify the token in Middleware, developers might accidentally import Firebase Admin SDK into `middleware.ts`.
**Risk:** Firebase Admin relies on Node.js native modules (`fs`, `crypto`). Next.js Middleware runs on the V8 Edge Runtime. Importing Firebase Admin into Middleware will break the build.
**Classification:** Architecture Risk. You must use `jose` or lightweight edge-compatible libraries to verify tokens in Middleware.

---

## 🟡 MEDIUM FINDINGS (Dependencies & Cleanup)

### 1. Extraneous Vite Plugins & Scripts
**Finding:** `package.json` retains `vite-plugin-compression`.
**Risk:** This is dead code. Next.js handles Brotli and Gzip compression natively or via Vercel/Node. Keep it clean to avoid confusion.
**Classification:** Dependency Cleanup Mistake.

### 2. `react-helmet-async` Retention
**Finding:** `react-helmet-async` remains in `package.json` and is likely used in the legacy `src/screens` components.
**Risk:** Next.js uses the `Metadata` API exported from `page.tsx`/`layout.tsx` files. Using Helmet in a Next.js App Router project causes duplicate tags, React hydration errors, and poor SEO indexing.
**Classification:** Genuine Flaw / Next.js Anti-pattern.

---

## 🟢 LOW FINDINGS (Code Smells & Formatting)

### 1. TypeScript Ignore Flags
**Finding:** `next.config.ts` has `typescript: { ignoreBuildErrors: true }`.
**Risk:** Masking type errors during a migration is common, but it allows buggy imports (like `react-router-dom`) to slip into the Next.js build.
**Classification:** Transitional Architecture. Remove this as soon as the routing transition is complete.

---

## 📝 AUDITOR RECOMMENDATIONS FOR SAFE MIGRATION

1. **Purge React Router:** Immediately `npm uninstall react-router-dom`. Find all `useNavigate`/`Link` imports from it and replace them with `next/navigation` and `next/link`.
2. **Remove Root `"use client"`:** Remove `"use client"` from `src/app/layout.tsx`. Move client-heavy state down the component tree. A layout should rarely be a client component.
3. **Consolidate ENV:** Delete all `VITE_` variables from the `.env` file, remove the shim in `next.config.ts`, and rely strictly on `NEXT_PUBLIC_`.
4. **Purge Helmet:** Remove `react-helmet-async` and replace it with Next.js `export const metadata = {}`.
