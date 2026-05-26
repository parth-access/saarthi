import React from 'react';
import { Metadata } from 'next';
import HomeClient from './HomeClient';

export const metadata: Metadata = {
  title: 'Saarthi — Online Therapy & Mental Wellness Support in India',
  description: 'Book online sessions with certified, empathetic therapists on Saarthi. Find expert guidance for anxiety, stress relief, student counselling, and emotional wellness.',
  openGraph: {
    title: 'Saarthi — Online Therapy & Mental Wellness Support',
    description: 'Book online sessions with certified, empathetic therapists. Start your emotional wellness journey in India.',
    url: 'https://saarthilife.com',
    images: [
      {
        url: '/api/og?title=Saarthi — Your Safe Space&description=Book verified, empathetic therapists for online counselling sessions.',
        width: 1200,
        height: 630,
        alt: 'Saarthi Online Therapy & Counselling Platform',
      },
    ],
  },
  twitter: {
    title: 'Saarthi — Online Therapy & Mental Wellness Support',
    description: 'Book online sessions with certified, empathetic therapists on Saarthi. Modern, professional counselling support in India.',
    images: ['/api/og?title=Saarthi — Your Safe Space&description=Book verified, empathetic therapists for online counselling sessions.'],
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
        'contactPoint': {
          '@type': 'ContactPoint',
          'email': 'contact@saarthilife.com',
          'contactType': 'customer support',
          'availableLanguage': 'English'
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
      },
      {
        '@type': 'MedicalBusiness',
        '@id': 'https://saarthilife.com/#medicalbusiness',
        'name': 'Saarthi Therapy & Counselling',
        'url': 'https://saarthilife.com',
        'logo': 'https://saarthilife.com/saarthi-logo-Photoroom.png',
        'description': 'Book certified therapists for online session therapy. Feel heard, understood, and supported in a gentle, warm, and professional space.',
        'address': {
          '@type': 'PostalAddress',
          'addressLocality': 'Delhi',
          'addressRegion': 'Delhi',
          'addressCountry': 'IN'
        },
        'priceRange': '$$',
        'areaServed': 'IN'
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
