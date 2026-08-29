import React from 'react';
import { Metadata } from 'next';
import HomeClient from './HomeClient';
import { ogImage } from '@/lib/og';

const ogImageUrl = ogImage(
  'Saarthi — Your Safe Space',
  'Book verified, empathetic therapists for online counselling sessions in India.'
);

export const metadata: Metadata = {
  title: 'Online Therapy & Mental Wellness Support in India',
  description: 'Book online sessions with certified, empathetic therapists on Saarthi. Find expert guidance for anxiety, stress relief, student counselling, and emotional wellness.',
  openGraph: {
    title: 'Saarthi — Online Therapy & Mental Wellness Support',
    description: 'Book online sessions with certified, empathetic therapists. Start your emotional wellness journey in India.',
    url: 'https://saarthilife.com',
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Online Therapy & Counselling Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Saarthi — Online Therapy & Mental Wellness Support',
    description: 'Book online sessions with certified, empathetic therapists on Saarthi. Modern, professional counselling support in India.',
    images: [ogImageUrl],
  },
  alternates: {
    canonical: '/',
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://saarthilife.com/#organization',
        'name': 'Saarthi',
        'url': 'https://saarthilife.com',
        'logo': 'https://saarthilife.com/saarthi-logo-Photoroom.png',
        'description': 'Online therapy and mental wellness support platform connecting people with verified, empathetic therapists in India.',
        'contactPoint': {
          '@type': 'ContactPoint',
          'email': 'contact@saarthilife.com',
          'contactType': 'customer support',
          'availableLanguage': ['English', 'Hindi']
        }
      },
      {
        '@type': 'WebSite',
        '@id': 'https://saarthilife.com/#website',
        'url': 'https://saarthilife.com',
        'name': 'Saarthi — Mental Wellness & Therapy',
        'publisher': {
          '@id': 'https://saarthilife.com/#organization'
        }
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient />
    </>
  );
}
