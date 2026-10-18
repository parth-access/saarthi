import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase/admin';
import { ogImage } from '@/lib/og';
import { getTherapistBookingHref } from '@/constants/therapists';
import { sessionPriceDisplayFor } from '@/components/booking/bookingUi';
import TherapistProfileClient, { type PublicTherapistProfile } from './TherapistProfileClient';

/** Profiles change rarely; re-render at most every 5 minutes. */
export const revalidate = 300;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Bookable, non-archived therapists only — paused/archived profiles 404. */
const loadTherapist = cache(async (slug: string): Promise<(PublicTherapistProfile & { slug: string }) | null> => {
  if (!SLUG.test(slug) || !adminDb) return null;
  const snap = await adminDb.collection('therapists').where('slug', '==', slug).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const d = doc.data();
  if (d.active === false || d.archived === true) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const therapist = { id: doc.id, slug, sessionPrice: d.sessionPrice };
  return {
    slug,
    name: str(d.name) || 'Saarthi therapist',
    specialization: str(d.specialization),
    experience: str(d.experience),
    bio: str(d.bio),
    image: str(d.image),
    bookingHref: getTherapistBookingHref({ ...therapist } as Parameters<typeof getTherapistBookingHref>[0]),
    priceLabel: `${sessionPriceDisplayFor(therapist)} per session`,
  };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await loadTherapist(slug);
  if (!t) return { title: 'Therapist not found', robots: { index: false } };
  const title = `${t.name}${t.specialization ? ` — ${t.specialization}` : ''}`;
  const description =
    (t.bio.split('\n')[0] || `Book online therapy sessions with ${t.name} on Saarthi.`).slice(0, 160);
  const image = ogImage(title, description);
  return {
    title,
    description,
    alternates: { canonical: `/therapists/${t.slug}` },
    openGraph: { title: `${title} | Saarthi`, description, url: `https://www.saarthilife.com/therapists/${t.slug}`, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: `${title} | Saarthi`, description, images: [image] },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await loadTherapist(slug);
  if (!t) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: t.name,
    jobTitle: t.specialization || 'Therapist',
    url: `https://www.saarthilife.com/therapists/${t.slug}`,
    ...(t.image ? { image: t.image.startsWith('http') ? t.image : `https://www.saarthilife.com${t.image}` } : {}),
    worksFor: { '@type': 'Organization', name: 'Saarthi', url: 'https://www.saarthilife.com' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <TherapistProfileClient profile={t} />
    </>
  );
}
