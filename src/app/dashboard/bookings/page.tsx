"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import DashboardBookingsPage from "@/screens/DashboardBookings";

export default function DashboardBookingsRoute() {
  return (
    <ProtectedRoute>
      <DashboardBookingsPage />
    </ProtectedRoute>
  );
}