"use client";

import React, { useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Modal } from '@/components/ui/Modal';
import BookingSystem from '@/components/booking/BookingSystem';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar onBookClick={() => setIsBookingOpen(true)} />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />

      <Modal 
        isOpen={isBookingOpen} 
        onClose={() => setIsBookingOpen(false)} 
        title="Book a Session"
        className="sm:max-w-3xl"
      >
        <BookingSystem />
      </Modal>
    </div>
  );
}
