"use client";

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const Therapists = dynamic(() => import('@/screens/Therapists'), { ssr: false });

export default function TherapistsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Therapists />
    </Suspense>
  );
}
