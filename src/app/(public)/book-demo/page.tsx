import React from 'react';
import { Metadata } from 'next';
import BookClient from '../book/BookClient';

export const metadata: Metadata = {
  title: 'Book a Consultation Session | Saarthi',
  description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
  openGraph: {
    title: 'Book a Consultation Session | Saarthi',
    description: 'Book your confidential online therapy or mental health assessment session directly with certified counsellors on Saarthi.',
    url: 'https://saarthilife.com/book-demo',
  },
  alternates: {
    canonical: '/book-demo',
  },
};

export default function BookDemoPage() {
  return <BookClient />;
}
