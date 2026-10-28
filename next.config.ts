import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Type-checking and linting run during `next build` (Next defaults): the
  // build gate must fail on type errors or lint errors. Do not re-add
  // ignoreBuildErrors / ignoreDuringBuilds — that is how a broken deploy
  // (e.g. the module-scope Resend build crash) would have shipped.
  experimental: {
    // Vercel's 8 GB build machine ran out of memory after type-check/lint;
    // this trades a little build time for a lower webpack memory peak.
    webpackMemoryOptimizations: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'saarthilife.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/book-demo',
        destination: '/book',
        permanent: true,
      },
      // Retired images (old links, emails, Firestore records) → optimized WebP.
      { source: '/dravina.png', destination: '/dravina.webp', permanent: true },
      { source: '/about_page.png', destination: '/dravina.webp', permanent: true },
      { source: '/vision_page.png', destination: '/vision_page.webp', permanent: true },
      { source: '/home_page.jpeg', destination: '/home_page.webp', permanent: true },
    ];
  },
  // Firebase Auth's sign-in helper, served from our own domain. With
  // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN set to the site's host, Google's consent
  // screen says "continue to saarthilife.com" instead of the
  // <project>.firebaseapp.com default, and the popup stays first-party.
  async rewrites() {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return [];
    return [
      { source: '/__/auth/:path*', destination: `https://${projectId}.firebaseapp.com/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `https://${projectId}.firebaseapp.com/__/firebase/:path*` },
    ];
  },
  // Security headers (CSP, X-Frame-Options, HSTS, ...) are defined ONLY in
  // vercel.json. Do not add a headers() block here: duplicate/conflicting
  // CSP headers are intersected by browsers, so any drift between two copies
  // can silently block resources.
};

// Wrap with Sentry config only if SENTRY_DSN or SENTRY_ORG is present, or export directly to keep dev server snappy and robust
export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_ORG
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT || 'javascript-nextjs',
      silent: true,
      // Not widened: source maps for every library chunk pushed the Vercel
      // build out of memory. Our own code's stack traces stay readable.
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      automaticVercelMonitors: true,
      disableLogger: true,
    })
  : nextConfig;