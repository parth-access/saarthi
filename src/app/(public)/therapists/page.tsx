import React from 'react';
import { Metadata } from 'next';
import TherapistsClient from './TherapistsClient';

export const metadata: Metadata = {
  title: 'Our Certified Online Therapists & Psychologists | Saarthi',
  description: 'Meet our verified team of empathetic, licensed psychologists on Saarthi. Find clinical therapists specializing in mindfulness, anxiety, depression, CBT, and stress management.',
  openGraph: {
    title: 'Our Certified Online Therapists & Psychologists | Saarthi',
    description: 'Meet our verified team of empathetic, licensed psychologists on Saarthi. Professional online sessions for stress, anxiety, and wellness.',
    url: 'https://saarthilife.com/therapists',
    images: [
      {
        url: '/api/og?title=Meet Our Verified Therapists&description=Connect with licensed, empathetic psychologists holding verified credentials on Saarthi.',
        width: 1200,
        height: 630,
        alt: 'Saarthi Certified Therapists and Psychologists',
      },
    ],
  },
  twitter: {
    title: 'Our Certified Online Therapists & Psychologists | Saarthi',
    description: 'Meet our verified team of empathetic, licensed psychologists on Saarthi. Find clinical therapists.',
    images: ['/api/og?title=Meet Our Verified Therapists&description=Connect with licensed, empathetic psychologists holding verified credentials on Saarthi.'],
  },
  alternates: {
    canonical: '/therapists',
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    'name': 'Saarthi Certified Professional Therapists',
    'description': 'Browse verified, empathetic clinical psychologists and counselors representing Saarthi online mental health network in Delhi and India.',
    'mainEntity': {
      '@type': 'ItemList',
      'itemListElement': [
        {
          '@type': 'ListItem',
          'position': 1,
          'item': {
            '@type': 'Person',
            'name': 'Dravina Gupta',
            'jobTitle': 'Founder & Psychologist',
            'url': 'https://saarthilife.com/therapists/dravina',
            'description': 'Specializing in anxiety, depression, relationship issues, and mindfulness-based stress reduction.'
          }
        }
      ]
    }
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
