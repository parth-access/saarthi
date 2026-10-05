import React from 'react';
import { Metadata } from 'next';
import DravinaClient from './DravinaClient';
import { ogImage } from '@/lib/og';

const dravinaOgImageUrl = ogImage(
  'Dravina Gupta — Certified Clinical Psychologist',
  'Empathetic and structured therapy support for anxiety, anger, stress, and child/family concerns.'
);

export const metadata: Metadata = {
  title: 'Dravina Gupta — Certified Clinical Psychologist',
  description: 'Book online sessions with Dravina Gupta, a certified clinical psychologist at Saarthi. Expert in CBT, anxiety therapy, anger management, stress counselling, and mindfulness.',
  openGraph: {
    title: 'Dravina Gupta — Certified Clinical Psychologist | Saarthi',
    description: 'Book online sessions with Dravina Gupta, a certified psychologist specializing in CBT, anxiety therapy, anger management, and mindfulness on Saarthi.',
    url: 'https://www.saarthilife.com/therapists/dravina',
    images: [
      {
        url: dravinaOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'Dravina Gupta - Certified Psychologist Profile',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dravina Gupta — Certified Clinical Psychologist | Saarthi',
    description: 'Book online sessions with Dravina Gupta, a certified clinical psychologist at Saarthi. Expert in CBT, anxiety therapy, anger management, and mindfulness.',
    images: [dravinaOgImageUrl],
  },
  alternates: {
    canonical: '/therapists/dravina',
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': 'https://www.saarthilife.com/therapists/dravina/#person',
        'url': 'https://www.saarthilife.com/therapists/dravina',
        'name': 'Dravina Gupta',
        'jobTitle': 'Psychologist & Clinical Counsellor',
        'knowsLanguage': ['Hindi', 'English'],
        'description': 'Psychologist holding a Master’s in Clinical Psychology, specializing in anger management, anxiety, depression, and Cognitive Behavioral Therapy.',
        'image': 'https://www.saarthilife.com/dravina.png',
        'worksFor': {
          '@type': 'Organization',
          'name': 'Saarthi',
          'url': 'https://www.saarthilife.com'
        },
        'knowsAbout': [
          'Cognitive Behavioral Therapy (CBT)',
          'Acceptance & Commitment Therapy (ACT)',
          'Solution Focused Brief Therapy (SFBT)',
          'Mindfulness',
          'Anger Management',
          'Anxiety treatment'
        ]
      },
      {
        '@type': 'ProfessionalService',
        'name': 'Dravina Gupta Psychotherapeutic Services',
        'url': 'https://www.saarthilife.com/therapists/dravina',
        'image': 'https://www.saarthilife.com/dravina.png',
        'description': 'Online psychological consulting and CBT sessions for stress relief, adolescent concerns, anger, and anxiety.',
        'email': 'contact@saarthilife.com',
        'provider': {
          '@id': 'https://www.saarthilife.com/therapists/dravina/#person'
        },
        'areaServed': 'IN',
        'serviceType': 'Online Psychological Therapy & Counselling',
        'priceRange': '$$'
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DravinaClient />
    </>
  );
}
