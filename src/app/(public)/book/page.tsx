import React from 'react';
import { Metadata } from 'next';
import BookClient from './BookClient';

export const metadata: Metadata = {
  title: 'Book an Online Therapy Session | Saarthi',
  description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
  openGraph: {
    title: 'Book an Online Therapy Session | Saarthi',
    description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
    url: 'https://saarthilife.com/book',
    images: [
      {
        url: '/api/og?title=Book Your Therapy Session&description=Select a slot and reserve your confidential session with an empathetic professional.',
        width: 1200,
        height: 630,
        alt: 'Saarthi Consultation Booking Scheduler',
      },
    ],
  },
  twitter: {
    title: 'Book an Online Therapy Session | Saarthi',
    description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
    images: ['/api/og?title=Book Your Therapy Session&description=Select a slot and reserve your confidential session with an empathetic professional.'],
  },
  alternates: {
    canonical: '/book',
  },
};

export default function Page() {
  return <BookClient />;
}
