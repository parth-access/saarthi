"use client";

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const Contact = dynamic(() => import('@/screens/Contact'), { ssr: false });

export default function ContactPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Contact onBookClick={() => {}} />
    </Suspense>
  );
}
