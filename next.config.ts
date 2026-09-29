import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Add experimental features or redirects here if needed
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
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
      widenClientFileUpload: true,
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
      automaticVercelMonitors: true,
      disableLogger: true,
    })
  : nextConfig;