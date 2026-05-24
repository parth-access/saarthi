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
        '/api/*',
      ],
    },
    sitemap: 'https://saarthilife.com/sitemap.xml',
  };
}
