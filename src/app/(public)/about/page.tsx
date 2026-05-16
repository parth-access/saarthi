"use client";

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const About = dynamic(() => import('@/screens/About'), { ssr: false });

export default function AboutPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <About />
    </Suspense>
  );
}
