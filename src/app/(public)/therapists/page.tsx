import React from 'react';
import { Metadata } from 'next';
import TherapistsClient from './TherapistsClient';
import { ogImage } from '@/lib/og';
import { therapistService } from '@/services/therapistService';
import { Therapist } from '@/types';
import { DEFAULT_THERAPISTS } from '@/constants/therapists';

const therapistsOgImageUrl = ogImage(
  'Meet Our Verified Therapists',
  'Connect with licensed, empathetic psychologists holding verified credentials on Saarthi.'
);

export const metadata: Metadata = {
  title: 'Our Certified Online Therapists & Psychologists',
  description: 'Meet our verified team of empathetic, licensed psychologists on Saarthi. Find clinical therapists specializing in mindfulness, anxiety, depression, CBT, and stress management.',
  openGraph: {
    title: 'Our Certified Online Therapists & Psychologists | Saarthi',
    description: 'Meet our verified team of empathetic, licensed psychologists on Saarthi. Professional online sessions for stress, anxiety, and wellness.',
    url: 'https://www.saarthilife.com/therapists',
    images: [
      {
        url: therapistsOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Certified Therapists and Psychologists',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Certified Online Therapists & Psychologists | Saarthi',
    description: 'Meet our verified team of empathetic, licensed psychologists on Saarthi. Find clinical therapists.',
    images: [therapistsOgImageUrl],
  },
  alternates: {
    canonical: '/therapists',
  },
};

export default async function Page() {
  let therapists: Therapist[] = [];
  try {
    const fetched = await therapistService.getTherapists();
    therapists = fetched && fetched.length > 0 ? fetched : DEFAULT_THERAPISTS;
  } catch {
    therapists = DEFAULT_THERAPISTS;
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Saarthi Certified Professional Therapists & Counsellors',
    'description': 'Browse verified, empathetic clinical psychologists and counselors representing Saarthi online mental health network in India.',
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
          : 'https://www.saarthilife.com/dravina.png';

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
      <TherapistsClient />
    </>
  );
}
