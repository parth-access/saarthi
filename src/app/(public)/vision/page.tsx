"use client";

import React, { Suspense } from 'react';
import Vision from '@/screens/Vision';

export default function VisionPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Vision />
    </Suspense>
  );
}
