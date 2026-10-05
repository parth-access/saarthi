import React from 'react';
import { Metadata } from 'next';
import VisionClient from './VisionClient';
import { ogImage } from '@/lib/og';

const visionOgImageUrl = ogImage(
  'Our Vision — Emotional Well-Being Made Simple',
  'A noise-free sanctuary offering quiet support and holistic growth for mental health.'
);

export const metadata: Metadata = {
  title: 'Our Vision for Digital Mental Health | Saarthi',
  description: 'Read the foundational principles and pillars of care behind Saarthi. We strive to make emotional wellness, anxiety treatment, and student therapy gentle, safe, and stigma-free.',
  openGraph: {
    title: 'Our Vision for Digital Mental Health | Saarthi',
    description: 'Read how Saarthi stands as a quiet sanctuary for gentle mental wellness guidance. Modern, compassionate emotional support.',
    url: 'https://www.saarthilife.com/vision',
    images: [
      {
        url: visionOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Vision and Philosophy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Vision for Digital Mental Health | Saarthi',
    description: 'A noise-free sanctuary offering quiet support and holistic growth for mental health. Explore Saarthi’s vision.',
    images: [visionOgImageUrl],
  },
  alternates: {
    canonical: '/vision',
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': 'Saarthi Vision and Pillars of Care',
    'description': 'A quiet sanctuary, gentle guidance, and cultural empathy forming the cornerstone of accessible mental well-being.',
    'publisher': {
      '@type': 'Organization',
      'name': 'Saarthi',
      'url': 'https://www.saarthilife.com'
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VisionClient />
    </>
  );
}
