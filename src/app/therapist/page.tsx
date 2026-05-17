"use client";

import TherapistPage from "@/screens/Admin";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function TherapistRoute() {
  return (
    <ProtectedRoute allowedRoles={['therapist']}>
      <TherapistPage />
    </ProtectedRoute>
  );
}
