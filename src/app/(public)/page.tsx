"use client";

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const Home = dynamic(() => import('@/screens/Home'), { ssr: false });

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Home onBookClick={() => {}} />
    </Suspense>
  );
}
