import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.saarthilife.com';

  const mainRoutes = [
    '',
    '/about',
    '/contact',
    '/therapists',
    '/vision',
    '/therapists/dravina',
    '/book',
  ];

  const legalRoutes = ['/privacy', '/terms'];

  return [
    ...mainRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1.0 : route === '/therapists' || route === '/book' ? 0.9 : 0.8,
    })),
    ...legalRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
