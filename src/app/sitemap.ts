import { MetadataRoute } from 'next';
import { adminDb } from '@/lib/firebase/admin';

/** Rebuild hourly so new therapist profiles are picked up. */
export const revalidate = 3600;

/** Public, bookable therapist profiles (Dravina's hand-built page is listed above). */
async function therapistProfileRoutes(): Promise<string[]> {
  try {
    if (!adminDb) return [];
    const snap = await adminDb.collection('therapists').where('active', '==', true).get();
    return snap.docs
      .map((d) => d.data())
      .filter((d) => d.archived !== true && typeof d.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug) && d.slug !== 'dravina')
      .map((d) => `/therapists/${d.slug}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.saarthilife.com';
  const lastModified = new Date();

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

  const profileRoutes = await therapistProfileRoutes();

  return [
    ...profileRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...mainRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: route === '' ? 1.0 : ['/therapists', '/book', '/therapists/dravina'].includes(route) ? 0.9 : 0.8,
    })),
    ...legalRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
