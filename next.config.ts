import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Add experimental features or redirects here if needed
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true, 
  }
};

export default nextConfig;
