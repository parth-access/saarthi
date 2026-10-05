import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Manage Session',
  description: 'Confidential session management on Saarthi.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function ManageBookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
