import React from 'react';
import { Metadata } from 'next';
import ContactClient from './ContactClient';

export const metadata: Metadata = {
  title: 'Contact Saarthi — Online CBT, Anxiety & Wellness Counselling',
  description: 'Reach out to Saarthi for booking support or general mental wellness inquiries. Message our clinical psychologists and start online therapy sessions safely.',
  openGraph: {
    title: 'Contact Saarthi — Online CBT, Anxiety & Wellness Counselling',
    description: 'Reach out to Saarthi for booking support or general mental wellness inquiries. Message our psychologists to start online therapy.',
    url: 'https://saarthilife.com/contact',
    images: [
      {
        url: '/api/og?title=Contact Saarthi Support&description=Get in touch today. Our team is here to listen and guide you without judgment.',
        width: 1200,
        height: 630,
        alt: 'Contact Saarthi Counseling Platform',
      },
    ],
  },
  twitter: {
    title: 'Contact Saarthi — Online CBT, Anxiety & Wellness Counselling',
    description: 'Contact Saarthi for professional counselling and online therapist sessions. Reach out today.',
    images: ['/api/og?title=Contact Saarthi Support&description=Get in touch today. Our team is here to listen and guide you without judgment.'],
  },
  alternates: {
    canonical: '/contact',
  },
};

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    'contactPoint': {
      '@type': 'ContactPoint',
      'email': 'contact@saarthilife.com',
      'contactType': 'customer support',
      'areaServed': 'IN',
      'availableLanguage': ['English', 'Hindi']
    }
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContactClient />
    </>
  );
}
