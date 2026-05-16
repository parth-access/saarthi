"use client";

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';

const Login = dynamic(() => import('@/screens/Login'), { ssr: false });

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Login />
    </Suspense>
  );
}
