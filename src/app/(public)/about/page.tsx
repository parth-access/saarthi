import React from 'react';
import { Metadata } from 'next';
import AboutClient from './AboutClient';
import { ogImage } from '@/lib/og';

const aboutOgImageUrl = ogImage(
  'About Saarthi — Meet Our Founders',
  'A safe space founded by professional psychologists to walk with you on your emotional journey.'
);

export const metadata: Metadata = {
  title: 'About Saarthi — Our Founders, Mission & Team',
  description: 'Learn about Saarthi, the safe online mental health space founded by empathetic professionals. Meet psychologist Dravina Gupta and our team dedicated to gentle mental wellness guidance.',
  openGraph: {
    title: 'About Saarthi — Our Founders, Mission & Team',
    description: 'Learn about Saarthi, the safe online mental health space founded by professional psychologists. Meet our founders Dravina and Krishna.',
    url: 'https://saarthilife.com/about',
    images: [
      {
        url: aboutOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'About Saarthi Team and Founders',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Saarthi — Our Founders, Mission & Team',
    description: 'Learn about Saarthi, the safe online mental health space founded by empathetic professionals. Meet founders Dravina and Krishna.',
    images: [aboutOgImageUrl],
  },
  alternates: {
    canonical: '/about',
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    'mainEntity': {
      '@type': 'Organization',
      'name': 'Saarthi',
      'url': 'https://saarthilife.com',
      'founder': [
        {
          '@type': 'Person',
          'name': 'Dravina Gupta',
          'jobTitle': 'Founder & Psychologist'
        },
        {
          '@type': 'Person',
          'name': 'Krishna Gupta',
          'jobTitle': 'Co-Founder'
        }
      ],
      'description': 'An empathetic online therapy and guidance platform offering gentle mental health support across Delhi and India.'
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AboutClient />
    </>
  );
}
