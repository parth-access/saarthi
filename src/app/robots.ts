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
        '/secure',
        '/secure/*',
        '/therapist',
        '/therapist/*',
        '/manage-booking',
        '/manage-booking/*',
        '/api/*',
        '/login',
        '/auth-popup',
        '/sentry-example-page',
      ],
    },
    sitemap: 'https://www.saarthilife.com/sitemap.xml',
  };
}
