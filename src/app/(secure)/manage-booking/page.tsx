"use client";

import { Suspense } from "react";
import ManageBooking from "@/screens/ManageBooking";

export default function ManageBookingRoute() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ManageBooking />
    </Suspense>
  );
}
