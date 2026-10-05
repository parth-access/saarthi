import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/dashboard/*',
        '/admin',
        '/admin/*',
        // Trailing slash / `$` so this does NOT prefix-match the public
        // /therapists pages. Bare /therapist is matched exactly via `$`.
        '/therapist$',
        '/therapist/',
        '/manage-booking',
        '/manage-booking/*',
        '/api/*',
        '/login',
        '/auth-popup',
      ],
    },
    sitemap: 'https://www.saarthilife.com/sitemap.xml',
  };
}