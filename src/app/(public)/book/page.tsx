import React from 'react';
import { Metadata } from 'next';
import BookClient from './BookClient';
import { ogImage } from '@/lib/og';

const ogImageUrl = ogImage(
  'Book Your Therapy Session',
  'Select a slot and reserve your confidential session with an empathetic professional.'
);

export const metadata: Metadata = {
  title: 'Book an Online Therapy Session',
  description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
  openGraph: {
    title: 'Book an Online Therapy Session | Saarthi',
    description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
    url: 'https://www.saarthilife.com/book',
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: 'Saarthi Consultation Booking Scheduler',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Book an Online Therapy Session | Saarthi',
    description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
    images: [ogImageUrl],
  },
  alternates: {
    canonical: '/book',
  },
};

export default function Page() {
  return <BookClient />;
}
