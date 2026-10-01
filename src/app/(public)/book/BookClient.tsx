"use client";


import React from "react";
import BookingSystem from "@/components/booking/BookingSystem";

interface BookPageProps {
  requestedTherapist?: string | null;
}

export default function BookPage({ requestedTherapist }: BookPageProps) {
  return (
    <div className="pt-24 pb-12 sm:pt-32 sm:pb-24 max-w-4xl mx-auto px-4">
      <BookingSystem requestedTherapist={requestedTherapist} />
    </div>
  );
}
