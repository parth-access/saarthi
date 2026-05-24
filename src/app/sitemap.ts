import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://saarthilife.com';

  const routes = [
    '',
    '/about',
    '/contact',
    '/therapists',
    '/vision',
    '/therapists/dravina',
    '/book',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: route === '' ? 1.0 : route === '/therapists' ? 0.9 : 0.8,
  }));
}
