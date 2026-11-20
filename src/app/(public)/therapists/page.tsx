import 'server-only';
import React from 'react';
import { Metadata } from 'next';
import TherapistsClient from './TherapistsClient';
import { ogImage } from '@/lib/og';
import { adminDb } from '@/lib/firebase/admin';
import { mapTherapist } from '@/utils/mappers';
import { Therapist } from '@/types';
import { DEFAULT_THERAPISTS } from '@/constants/therapists';

/** The directory changes rarely; re-render at most every 5 minutes. */
export const revalidate = 300;

/**
 * Read on the server so the cards are in the HTML that search engines and
 * link previews receive, rather than appearing only after the browser fetches
 * them. Bookable, non-archived therapists only, as on the profile pages; the
 * built-in profile stands in if the read fails or finds nobody.
 */
async function loadDirectory(): Promise<Therapist[]> {
  if (!adminDb) return DEFAULT_THERAPISTS;
  try {
    const snap = await adminDb.collection('therapists').where('active', '==', true).get();
    const listed = snap.docs
      .map((d) => mapTherapist(d.id, d.data()))
      .filter((t) => !t.archived);
    return listed.length > 0 ? listed : DEFAULT_THERAPISTS;
  } catch (err) {
    console.error('Could not read the therapist directory; showing the built-in profile.', err);
    return DEFAULT_THERAPISTS;
  }
}

const therapistsOgImageUrl = ogImage(
  'Meet Our Therapists',
  'Online sessions with empathetic psychologists on Saarthi.'
);

export const metadata: Metadata = {
  title: 'Our Online Therapists & Psychologists',
  description: 'Meet the empathetic psychologists on Saarthi, specializing in mindfulness, anxiety, depression, CBT, and stress management.',
  openGraph: {
    title: 'Our Online Therapists & Psychologists | Saarthi',
    description: 'Meet the empathetic psychologists on Saarthi. Online sessions for stress, anxiety, and wellness.',
    url: 'https://www.saarthilife.com/therapists',
    images: [
      {
        url: therapistsOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Therapists and Psychologists',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Online Therapists & Psychologists | Saarthi',
    description: 'Meet the empathetic psychologists on Saarthi.',
    images: [therapistsOgImageUrl],
  },
  alternates: {
    canonical: '/therapists',
  },
};

export default async function Page() {
  const therapists = await loadDirectory();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Saarthi Therapists & Counsellors',
    'description': 'Browse the empathetic psychologists and counsellors offering online sessions through Saarthi in India.',
    'url': 'https://www.saarthilife.com/therapists',
    'mainEntity': {
      '@type': 'ItemList',
      'itemListElement': therapists.map((t, index) => {
        const slug = t.name.toLowerCase().includes('dravina')
          ? 'dravina'
          : t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const profileUrl = `https://www.saarthilife.com/therapists/${slug}`;
        const personId = `${profileUrl}/#person`;
        const imageUrl = t.image
          ? (t.image.startsWith('http') ? t.image : `https://www.saarthilife.com${t.image.startsWith('/') ? '' : '/'}${t.image}`)
          : 'https://www.saarthilife.com/dravina.webp';

        return {
          '@type': 'ListItem',
          'position': index + 1,
          'item': {
            '@type': 'Person',
            '@id': personId,
            'url': profileUrl,
            'name': t.name,
            'jobTitle': t.specialization || 'Psychologist & Counsellor',
            'image': imageUrl,
            'description': t.bio,
          },
        };
      }),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TherapistsClient therapists={therapists} />
    </>
  );
}
